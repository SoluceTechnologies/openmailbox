UPDATE email SET signals = NULL
WHERE original_sender IS NULL
  AND (sender LIKE '%@simplelogin.co' OR sender LIKE '%@sl.co' OR sender GLOB '*+*=*@*');
