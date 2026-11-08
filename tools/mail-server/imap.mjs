import tls from 'node:tls';

export class ImapConnection {
  #socket;
  #buffer = '';
  #nextTag = 1;
  #pending = new Map();
  #untagged = [];
  #greeting;

  constructor(socket) {
    this.#socket = socket;
    this.#greeting = new Promise((resolve, reject) => {
      this.#pending.set('*greeting', { resolve, reject, lines: [] });
    });
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => this.#receive(chunk));
    socket.on('error', (error) => this.#failAll(error));
    socket.on('close', () => this.#failAll(new Error('connection closed')));
  }

  static async open({ host, port, ca }) {
    const socket = tls.connect({ host, port, ca, servername: host });
    const connection = new ImapConnection(socket);
    await connection.#greeting;
    return connection;
  }

  #receive(chunk) {
    this.#buffer += chunk;
    let end;
    while ((end = this.#buffer.indexOf('\r\n')) !== -1) {
      const line = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 2);
      this.#handleLine(line);
    }
  }

  #handleLine(line) {
    const greeting = this.#pending.get('*greeting');
    if (greeting) {
      this.#pending.delete('*greeting');
      greeting.resolve(line);
      return;
    }
    if (line.startsWith('* ') || line.startsWith('+')) {
      this.#untagged.push(line);
      return;
    }
    const [tag, status, ...rest] = line.split(' ');
    const waiting = this.#pending.get(tag);
    if (!waiting) return;
    this.#pending.delete(tag);
    const untagged = this.#untagged;
    this.#untagged = [];
    if (status === 'OK') waiting.resolve(untagged);
    else waiting.reject(new Error(`${waiting.command}: ${status} ${rest.join(' ')}`));
  }

  #failAll(error) {
    for (const waiting of this.#pending.values()) waiting.reject(error);
    this.#pending.clear();
  }

  #send(command, literal) {
    const tag = `A${this.#nextTag++}`;
    const promise = new Promise((resolve, reject) => this.#pending.set(tag, { resolve, reject, command: command.split(' ')[0] }));
    if (literal === undefined) {
      this.#socket.write(`${tag} ${command}\r\n`);
    } else {
      const bytes = Buffer.from(literal, 'utf8');
      this.#socket.write(`${tag} ${command} {${bytes.length}+}\r\n`);
      this.#socket.write(bytes);
      this.#socket.write('\r\n');
    }
    return promise;
  }

  run(command) {
    return this.#send(command);
  }

  append(mailbox, { raw, flags, date }) {
    return this.#send(`APPEND ${quote(mailbox)} (${flags.join(' ')}) "${imapDate(date)}"`, raw);
  }

  async listMailboxes() {
    const lines = await this.run('LIST "" "*"');
    return lines
      .map((line) => line.match(/^\* LIST \([^)]*\) (?:"[^"]*"|NIL) "?(.*?)"?$/))
      .filter(Boolean)
      .map((match) => match[1]);
  }

  async close() {
    await this.run('LOGOUT').catch(() => undefined);
    this.#socket.end();
  }
}

export function quote(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function imapDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getUTCDate())}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}
