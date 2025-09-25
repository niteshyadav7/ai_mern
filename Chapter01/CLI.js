// reading the data from the cmd line.

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Ask the Question : ", (value) => {
  console.log(value);
  rl.close();
});
