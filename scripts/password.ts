import { passwordHash } from '../server/security';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
process.stdout.write('管理者パスワード（12文字以上・画面に表示しません）: ');
muted = true;
rl.question('', async (password) => {
  muted = false;
  rl.close();
  if (password.length < 12) {
    console.error('\n12文字以上で入力してください');
    process.exitCode = 1;
    return;
  }
  console.log(
    '\nADMIN_PASSWORD_HASH に次のハッシュを設定してください。元のパスワードは保存しません。\n' +
      (await passwordHash(password)),
  );
});
