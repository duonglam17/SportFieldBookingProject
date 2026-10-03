const bcrypt = require('bcrypt');

async function main() {
  const hash = await bcrypt.hash('123456', 10);
  console.log('bcrypt hash cho mật khẩu mẫu 123456:');
  console.log(hash);
  console.log('Dán hash này vào cột password_hash trong seed.sql.');
}

main().catch((error) => {
  console.error('Không thể tạo bcrypt hash:', error);
  process.exitCode = 1;
});
