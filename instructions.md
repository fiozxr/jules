# 🤖 The Autonomous Companion Agent (ACA)

A breakthrough implementation merging Autonomous Exploration with Real-Time Social Gameplay in Minecraft.

The ACA bridges the gap between independent AI methodologies (like NVIDIA's *Voyager*) and real-time human collaboration (like *Mindcraft*). Powered by the **Gemini 1.5 Pro API** and **Mineflayer**, this bot explores, learns, and survives on its own, but seamlessly shifts into a loyal, collaborative "brother" mode the moment a human player interacts with it.

---

## ✨ Key Features

*   **Context-Aware Dual-Loop Engine:**
    *   **Idle Loop (Voyager Protocol):** When left alone, the agent analyzes its inventory, health, and tech tree stage to autonomously gather resources and progress.
    *   **Interrupt Loop (Social Proxy):** Instantly pauses autonomous tasks when a player speaks in chat, shifting focus to assist or converse with the player.
*   **Lifelong Iterative Skill Storage:**
    *   Instead of prompting the LLM for movement code every time, the bot drafts modular JavaScript files (`skills/`) using Mineflayer endpoints.
    *   It tests the code, captures errors in real-time, fixes its own code inline (Self-Healing), and saves the verified script to disk for future use.

---

## 🚀 Setup & Installation

### Prerequisites
*   Node.js (v16 or higher recommended)
*   A running Minecraft Java Edition Server (default targeted version is 1.18 - 1.20+ via Mineflayer)
*   A Google Gemini API Key

### Installation

1.  **Clone the repository** (or download the source).
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory (or export these variables in your terminal) and add your configuration:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    BOT_USERNAME=AI_Brother
    HOST=localhost
    PORT=25565
    ```

### Running the Bot

Start the central orchestrator:
```bash
node index.js
```
The bot will connect to the specified Minecraft server and immediately begin its Idle Loop.

---

## 🛠️ Developer Guide & Architecture

### The Central Orchestrator (`index.js`)

The `index.js` file serves as the main controller. It manages the state processing loop and interactions.

#### 1. Environmental Perception
Every few seconds (the *Idle Loop*), the bot builds a state payload:
*   **Agent State:** Coordinates, health, hunger, inventory.
*   **Surroundings:** Biome, time of day, nearby blocks, nearby entities.
*   **Context:** Last player chat, current internal goals.

This JSON payload is fed to the Gemini 1.5 Pro reasoning core.

#### 2. The Skill Execution System (`executeOrDraftSkill`)
When Gemini decides on an `action_intent` (e.g., "build a furnace"), the system:
1.  **Searches:** Looks in the `/skills` directory for a matching script (e.g., `build_a_furnace.js`).
2.  **Drafts:** If it doesn't exist, it prompts Gemini to write a Mineflayer-compatible JavaScript module, which is saved to disk.
3.  **Executes:** It runs the drafted (or existing) code.
4.  **Self-Heals:** If execution throws an in-game error (e.g., blocked path, missing materials), the error trace and faulty code are sent back to Gemini. Gemini rewrites the script, updates the file, and retries.

### Modifying the Prompt / Persona

The bot's personality is defined in `index.js` under the `systemInstruction` variable. You can tweak this to change the bot's tone, priority hierarchy, or specific behavioral quirks.

### Directory Structure
*   `index.js`: Main application entry point.
*   `skills/`: Directory where the bot automatically saves its generated JavaScript skills.

---

## 📝 Troubleshooting

*   **Bot getting stuck?** Check the console logs for `[SKILL ERROR]`. The self-healing module should handle most errors, but complex pathfinding bugs might require manual intervention or a server restart.
*   **Connection Refused?** Ensure your Minecraft server is running, the port matches your `.env`, and `online-mode` is set to `false` in `server.properties` if you are testing locally without official Microsoft auth.

Enjoy surviving with your new AI Brother!
