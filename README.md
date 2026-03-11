# Product Intelligence Agent

Full-stack agentic web application powered by the Open Food Facts public REST API. Users can ask natural language questions about food and grocery products and get intelligent, tool-enhanced responses.

## 1. Project overview

This project is a **product intelligence agent** built as a full-stack interview-ready demo. It lets users ask natural language questions about food products, brands, ingredients, and nutrition data. Under the hood it:

- **Searches and fetches products** from the public **Open Food Facts** API
- **Normalizes product data** (names, barcodes, brands, categories, ingredients, nutrition grades, images)
- Uses a **Claude-powered LangChain agent** that calls tools to query the local MCP server
- Exposes a **simple React chat UI** to make the experience feel like talking to a product analyst

This was built to demonstrate:

- Practical use of **tool-calling LLM agents** (LangChain + Claude)
- Clean separation between **UI, agent orchestration, and data-access layer (MCP server)**
- Integration with a **real public REST API** (Open Food Facts) without authentication

## 2. Architecture

High-level request flow:

```text
[ Browser / React UI ]
          |
          |  HTTP (POST /chat)
          v
[ Python Agent (FastAPI + LangChain + Claude) ]
          |
          |  Tool calls over HTTP
          v
[ MCP Server (Node.js + Express) ]
          |
          |  HTTPS (Open Food Facts REST API v2)
          v
[ Open Food Facts Public API ]
```

### Project structure

- **`/mcp-server`** — Node.js/Express MCP wrapper around the Open Food Facts API
- **`/agent`** — Python LangChain backend using Claude with tool calling
- **`/frontend`** — React UI for chatting with the agent

## 3. Prerequisites

- **Node.js**: v18+ (recommended LTS)
- **Python**: 3.11
- **pip**: Python package manager

You should also have access to an **Anthropic API key** for Claude.

## 4. Setup and run each service

### 4.1 MCP server (`/mcp-server`)

The MCP server is a thin Node.js/Express wrapper around the Open Food Facts API.

1. Install dependencies:

   ```bash
   cd mcp-server
   npm install
   ```

2. Start the server (port **3001**):

   ```bash
   npm start
   ```

   This exposes endpoints like:

   - `GET http://localhost:3001/health`
   - `GET http://localhost:3001/search?query=nutella&pageSize=5`
   - `GET http://localhost:3001/product/3017620422003`

### 4.2 Agent backend (`/agent`)

The agent service is a FastAPI app that wraps a LangChain tool-calling agent powered by Claude.

1. Create and activate a Python 3.11 environment (optional but recommended):

   ```bash
   cd agent
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment variables:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:

   ```bash
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

4. Start the agent API (port **8000**):

   ```bash
   python -m uvicorn agent:app --host 0.0.0.0 --port 8000 --reload
   ```

   The main endpoint is:

   - `POST http://localhost:8000/chat`

   Request body shape:

   ```json
   {
     "message": "user question here",
     "conversation_history": []
   }
   ```

### 4.3 Frontend (`/frontend`)

The frontend is a single-file React application powered by Vite.

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```

2. Start the dev server (port **5173**):

   ```bash
   npm run dev
   ```

3. Open the app in your browser:

   ```text
   http://localhost:5173
   ```

Make sure the **MCP server** (port 3001) and **agent backend** (port 8000) are running before using the UI.

## 5. Example queries to try

From the chat UI (or directly via the `/chat` endpoint), try questions like:

- **"Show me some popular chocolate hazelnut spreads and how their nutrition grades compare."**
- **"What is the nutrition grade and ingredient list for Nutella?"**
- **"Compare the nutrition of Coca-Cola vs Diet Coke by barcode."**
- **"Find breakfast cereal products with better nutrition grades and explain why they're healthier."**
- **"List some snack products from the 'biscuits' category and highlight any with poor nutrition grades."**

These will exercise different tools: full-text search, product-by-barcode lookup, category and brand filters, and the compare-products tool.

## 6. Deployment / Docker notes

For a production deployment you would typically **containerize** each service and orchestrate them together.

A likely setup:

- **Container 1: MCP server**
  - Base image: Node.js 18+ (e.g. `node:18-alpine`)
  - Copy `mcp-server` folder, run `npm install`, then `npm start`
  - Expose port **3001** inside the container

- **Container 2: Agent backend**
  - Base image: Python 3.11 (e.g. `python:3.11-slim`)
  - Copy `agent` folder, create a virtualenv, `pip install -r requirements.txt`
  - Set `ANTHROPIC_API_KEY` as a **container environment variable** (never bake it into the image)
  - Run `uvicorn agent:app --host 0.0.0.0 --port 8000`

- **Container 3: Frontend**
  - Build the React app with Vite: `npm run build`
  - Serve the static assets from a lightweight web server image
    (e.g. `nginx:alpine` + `COPY dist /usr/share/nginx/html`)

In a real deployment you would then:

- Put all three behind a reverse proxy or API gateway
- Configure **environment-specific base URLs** so the frontend talks to the agent, and the agent talks to the MCP server, using internal hostnames (e.g. `http://agent:8000`, `http://mcp-server:3001`)
- Add TLS termination, logging, and monitoring as needed

## 7. Environment variables

At the root of the repo there is a `.env.example`. Copy it to `.env` and fill in values as needed. Each service may also have its own `.env.example` file with service-specific variables.
