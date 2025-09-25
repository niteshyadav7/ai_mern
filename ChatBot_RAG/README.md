backend/
├── index.js # Entry point
├── routes/
│ ├── upload.js # Document upload route
│ └── ask.js # Question answering route
├── services/
│ ├── chunker.js # Split documents into chunks
│ ├── embeddings.js # Create embeddings & store in Supabase
│ └── retriever.js # Retrieve relevant chunks
└── utils/
└── supabaseClient.js # Supabase client

# Step 1: Setup Supabase Client

- utils/supabaseClient.js

```
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// Initialize Supabase client
export const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_API_KEY
);
```

# Step 2: Document Chunker Service

- services/chunker.js

```
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

/**
 * Splits a large document into smaller chunks for embeddings
 * @param {string} text - Document text
 * @returns {Array} - Array of document chunks
 */
export const splitDocument = async (text) => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,   // max characters per chunk
    chunkOverlap: 200, // overlap to preserve context
  });

  return await splitter.createDocuments([text]);
};
```

# Step 3: Embeddings & Vector Storage

- services/embeddings.js

import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { supabase } from "../utils/supabaseClient.js";

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
model: "text-embedding-3-small",
apiKey: process.env.OPENAI_API_KEY,
});

/\*\*

- Stores document chunks into Supabase vector store
- @param {Array} docs - Array of chunks from splitDocument
- @param {string} user_id - User ID
- @param {string} doc_name - Document name
  \*/
  export const storeChunksInSupabase = async (docs, user_id, doc_name) => {
  await SupabaseVectorStore.fromDocuments(docs, embeddings, {
  client: supabase,
  tableName: "documents",
  queryName: "match_documents",
  metadata: { user_id, doc_name },
  });
  };

```
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { supabase } from "../utils/supabaseClient.js";
```

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
model: "text-embedding-3-small",
apiKey: process.env.OPENAI_API_KEY,
});

/\*\*

- Stores document chunks into Supabase vector store
- @param {Array} docs - Array of chunks from splitDocument
- @param {string} user_id - User ID
- @param {string} doc_name - Document name
  \*/
  export const storeChunksInSupabase = async (docs, user_id, doc_name) => {
  await SupabaseVectorStore.fromDocuments(docs, embeddings, {
  client: supabase,
  tableName: "documents",
  queryName: "match_documents",
  metadata: { user_id, doc_name },
  });
  };

```

```

# Step 4: Retriever Service

- services/retriever.js

```
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { supabase } from "../utils/supabaseClient.js";

// Vector store initialized for retrieval
const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_API_KEY });

const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabase,
  tableName: "documents",
  queryName: "match_documents",
});

// Provides top-k relevant chunks for a query
export const retriever = vectorStore.asRetriever();


```

# Step 5: Upload Route

- routes/upload.js

```
import express from "express";
import multer from "multer";
import fs from "fs";
import { splitDocument } from "../services/chunker.js";
import { storeChunksInSupabase } from "../services/embeddings.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/**
 * POST /api/upload
 * Upload a file, split into chunks, store embeddings
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const user_id = req.body.user_id || "default_user";
    const doc_name = req.file.originalname;
    const text = fs.readFileSync(req.file.path, "utf-8");

    const chunks = await splitDocument(text);
    await storeChunksInSupabase(chunks, user_id, doc_name);

    fs.unlinkSync(req.file.path); // delete temp file
    res.json({ status: "success", message: "Document uploaded & processed!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

export default router;

```

# Step 6: Ask Route (RAG Pipeline)

- routes/ask.js

```
import express from "express";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { StringOutputParser } from "langchain/schema/output_parser";
import { retriever } from "../services/retriever.js";
import { RunnableSequence, RunnablePassthrough } from "langchain/schema/runnable";

const router = express.Router();
const llm = new ChatOpenAI({ openAIApiKey: process.env.OPENAI_API_KEY });

// 1️⃣ Convert follow-up question into standalone question
const standaloneQuestionPrompt = PromptTemplate.fromTemplate(
  `Given conversation history and a question, make a standalone question.
conversation history: {conv_history}
question: {question}
standalone question:`
);

// 2️⃣ Main answering prompt
const answerPrompt = PromptTemplate.fromTemplate(
  `You are a helpful chatbot. Answer only from context. If not in context, say you don't know.
context: {context}
conversation history: {conv_history}
question: {question}
answer:`
);

// 3️⃣ Chains
const standaloneQuestionChain = standaloneQuestionPrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

const retrieverChain = RunnableSequence.from([
  prevResult => prevResult.standalone_question,
  retriever,
  docs => docs.map(d => d.pageContent).join("\n\n")
]);

const answerChain = answerPrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

// Complete RAG chain
const chain = RunnableSequence.from([
  { standalone_question: standaloneQuestionChain, original_input: new RunnablePassthrough() },
  { context: retrieverChain, question: ({ original_input }) => original_input.question, conv_history: ({ original_input }) => original_input.conv_history },
  answerChain
]);

/**
 * POST /api/ask
 * Send user question + conversation history
 */
router.post("/", async (req, res) => {
  try {
    const { question, conv_history } = req.body;
    const answer = await chain.invoke({ question, conv_history });
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
```

# Step 7: Backend Entry Point

- index.js

```
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import uploadRoute from "./routes/upload.js";
import askRoute from "./routes/ask.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/upload", uploadRoute);
app.use("/api/ask", askRoute);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

```
