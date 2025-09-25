// How to read data from the cmd.

function printName(fullName) {
  console.log(`My name is ${fullName}.`);
}

// const data = process.argv;
// console.log(data.slice(2));

// printName(data.slice(2));

/**
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Ask the Question", (value) => {
  printName(value);
  rl.close();
});
 */

// AIzaSyAz1Z_1DW1hAAMBldsdHdiGImqVA64_2Uk

const api_key = "AIzaSyAz1Z_1DW1hAAMBldsdHdiGImqVA64_2Uk";

const genai = require("@google/genai");
const ai = new genai.GoogleGenAI({ apiKey: api_key });

async function main(contents) {
  const prompts = `you are an expert in everythings now tell me about ${contents}`;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompts,
    });
    console.log(response.text);
  } catch (err) {
    console.log(err);
  }
}

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Ask Question : ", (value) => {
  main(value);
  rl.close();
});
