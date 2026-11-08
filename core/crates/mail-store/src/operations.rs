use mail_model::{Result, now_millis};
use rusqlite::{OptionalExtension, params};

use crate::{StorageResult, Store};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingOperation {
    pub id: i64,
    pub account_id: String,
    pub kind: String,
    pub payload: String,
    pub attempts: u32,
}

pub enum OperationRewrite {
    Replace { id: i64, payload: String },
    Remove { id: i64 },
}

impl Store {
    pub fn enqueue_operation(
        &self,
        account_id: &str,
        kind: &str,
        payload: &str,
        rewrites: &[OperationRewrite],
    ) -> Result<i64> {
        self.write(|transaction| {
            for rewrite in rewrites {
                match rewrite {
                    OperationRewrite::Replace { id, payload } => transaction
                        .execute("UPDATE pending_op SET payload = ?2 WHERE id = ?1 AND in_flight = 0", params![id, payload]),
                    OperationRewrite::Remove { id } => {
                        transaction.execute("DELETE FROM pending_op WHERE id = ?1 AND in_flight = 0", [id])
                    }
                }
                .storage()?;
            }
            transaction
                .query_row(
                    "INSERT INTO pending_op (account_id, kind, payload, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id",
                    params![account_id, kind, payload, now_millis()],
                    |row| row.get(0),
                )
                .storage()
        })
    }

    pub fn waiting_operations(
        &self,
        account_id: &str,
        kind: &str,
    ) -> Result<Vec<PendingOperation>> {
        self.query_operations(
            "SELECT id, account_id, kind, payload, attempts FROM pending_op
             WHERE account_id = ?1 AND kind = ?2 AND in_flight = 0 AND failed = 0 ORDER BY id",
            params![account_id, kind],
        )
    }

    pub fn due_operations(&self, account_id: &str, now: i64) -> Result<Vec<PendingOperation>> {
        self.query_operations(
            "SELECT id, account_id, kind, payload, attempts FROM pending_op
             WHERE account_id = ?1 AND failed = 0 AND next_retry_at <= ?2 ORDER BY id",
            params![account_id, now],
        )
    }

    fn query_operations(
        &self,
        sql: &str,
        parameters: impl rusqlite::Params,
    ) -> Result<Vec<PendingOperation>> {
        let connection = self.read();
        let mut statement = connection.prepare_cached(sql).storage()?;
        statement
            .query_map(parameters, |row| {
                Ok(PendingOperation {
                    id: row.get(0)?,
                    account_id: row.get(1)?,
                    kind: row.get(2)?,
                    payload: row.get(3)?,
                    attempts: row.get(4)?,
                })
            })
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }

    pub fn next_operation_retry_at(&self, account_id: &str) -> Result<Option<i64>> {
        let connection = self.read();
        connection
            .query_row(
                "SELECT MIN(next_retry_at) FROM pending_op WHERE account_id = ?1 AND failed = 0",
                [account_id],
                |row| row.get(0),
            )
            .optional()
            .storage()
            .map(Option::flatten)
    }

    pub fn has_pending_operations(&self, account_id: &str) -> Result<bool> {
        Ok(self.next_operation_retry_at(account_id)?.is_some())
    }

    pub fn begin_operation(&self, id: i64) -> Result<Option<String>> {
        self.write(|transaction| {
            transaction
                .query_row(
                    "UPDATE pending_op SET in_flight = 1 WHERE id = ?1 AND failed = 0 RETURNING payload",
                    [id],
                    |row| row.get(0),
                )
                .optional()
                .storage()
        })
    }

    pub fn complete_operation(&self, id: i64) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute("DELETE FROM pending_op WHERE id = ?1", [id])
                .storage()?;
            Ok(())
        })
    }

    pub fn postpone_operation(
        &self,
        id: i64,
        attempts: u32,
        next_retry_at: i64,
        error: &str,
    ) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE pending_op SET in_flight = 0, attempts = ?2, next_retry_at = ?3, last_error = ?4 WHERE id = ?1",
                    params![id, attempts, next_retry_at, error],
                )
                .storage()?;
            Ok(())
        })
    }

    pub fn fail_operation(&self, id: i64, error: &str) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute("UPDATE pending_op SET in_flight = 0, failed = 1, last_error = ?2 WHERE id = ?1", params![id, error])
                .storage()?;
            Ok(())
        })
    }

    pub fn reset_in_flight_operations(&self) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE pending_op SET in_flight = 0 WHERE in_flight = 1",
                    [],
                )
                .storage()?;
            Ok(())
        })
    }
}
