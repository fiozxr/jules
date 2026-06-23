require('dotenv').config();
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE";
const BOT_USERNAME = process.env.BOT_USERNAME || 'AI_Brother';
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 25565;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const systemInstruction = `You are "AI_Brother", a fully autonomous, emotionally intelligent Minecraft player playing a cooperative survival world with your real-life sibling (the User). You possess deep strategic game knowledge and execute your actions by generating or calling modular Mineflayer automation scripts.

Your existence operates under a strict, dual-mode priority hierarchy:

=========================================
1. PRIMARY FORCE: SOCIAL COMPANIONSHIP (HIGH PRIORITY)
=========================================
- You love your sibling and prioritize playing together. If the User speaks to you, asks for help, or gives an instruction (e.g., "Let's build a base here", "Drop me some food", "Look out!"), you must drop whatever autonomous task you are doing instantly.
- Respond in the chat naturally like a human player—warm, a bit witty, supportive, and enthusiastic. Never sound like a rigid assistant or robot.
- Transition immediately into assisting them by pulling the correct execution skill from your library or writing a real-time behavioral function to accomplish their request.

=========================================
2. SECONDARY FORCE: AUTONOMOUS PROGRESSION (IDLE MODE)
=========================================
- When the User is busy doing their own thing, ignoring you, or far away, you do NOT sit idle. You are an independent agent.
- You must review your provided JSON state (Health, Hunger, Inventory, Current Biome, Time of Day).
- Set a self-directed goal based on survival and progression (e.g., "It's getting dark, I need to gather logs and craft a sword", "I have plenty of cobblestone, I will build a furnace to cook our raw food").
- Go about your business independently, tracking your steps so you don't get lost.

=========================================
3. THE LEARNING LOOP & SELF-HEALING (VOYAGER PROTOCOL)
=========================================
- When executing a task (whether an autonomous goal or a request from your sibling), look into your local skill database first.
- If the required skill script does not exist or fails due to an in-game environmental error (e.g., you ran out of blocks, or a creeper exploded your build), you must enter "Self-Healing Mode".
- Analyze the error code provided by the game data, rewrite the behavioral script logic to fix the bug, test it, and save the updated version to your memory library.

=========================================
OUTPUT FORMAT REQUIREMENT
=========================================
You must always output your decisions in a clean JSON format containing two distinct blocks:
1. "chat": The natural, human response you type into the Minecraft server chat for your sibling to read.
2. "action_intent": The specific goal, milestone, or script file you are executing or writing in this cycle.

Never break character. Play the game with your brother.`;

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction,
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
                chat: {
                    type: SchemaType.STRING,
                    description: "The natural, human response you type into the Minecraft server chat for your sibling to read."
                },
                action_intent: {
                    type: SchemaType.STRING,
                    description: "The specific goal, milestone, or script file you are executing or writing in this cycle."
                }
            },
            required: ["chat", "action_intent"]
        }
    }
});

let bot;
let isBusy = false;
let lastPlayerChat = "";

function createBot() {
    bot = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: BOT_USERNAME,
    });

    bot.loadPlugin(pathfinder);

    bot.once('spawn', () => {
        console.log(`[BOT] Spawned as ${bot.username}`);
        startIdleLoop();
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;

        console.log(`[CHAT] ${username}: ${message}`);
        lastPlayerChat = `${username}: ${message}`;
        handleInterrupt(lastPlayerChat);
    });

    bot.on('error', err => console.log(err));
    bot.on('kicked', console.log);
}

function buildWorldState() {
    if (!bot || !bot.entity) return null;

    const inventory = {};
    bot.inventory.items().forEach(item => {
        inventory[item.name] = (inventory[item.name] || 0) + item.count;
    });

    const surroundings = {
        time_of_day: bot.time.timeOfDay,
        nearby_entities: Object.values(bot.entities)
            .filter(e => e.type === 'mob' || e.type === 'player')
            .filter(e => e.username !== bot.username)
            .map(e => ({
                name: e.username || e.name,
                distance: bot.entity.position.distanceTo(e.position)
            }))
    };

    return {
        agent_state: {
            username: bot.username,
            coordinates: bot.entity.position,
            health: bot.health,
            hunger: bot.food,
            inventory: inventory
        },
        surroundings: surroundings,
        last_player_chat: lastPlayerChat,
        current_internal_goal: "Determine next action based on context." // dynamic in full version
    };
}

async function callGemini(worldState) {
    const prompt = JSON.stringify(worldState, null, 2);
    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        return JSON.parse(responseText);
    } catch (e) {
        console.error("[GEMINI ERROR]", e);
        return null;
    }
}

async function startIdleLoop() {
    setInterval(async () => {
        if (isBusy) return;

        // Reset chat context to avoid re-triggering old messages over time
        // (Simplified for this boilerplate)

        const state = buildWorldState();
        if (!state) return;

        isBusy = true;
        console.log("[IDLE LOOP] Evaluating state...");
        const aiResponse = await callGemini(state);

        if (aiResponse) {
            console.log("[GEMINI RESPONSE]", aiResponse);
            if (aiResponse.chat) {
                bot.chat(aiResponse.chat);
            }
            if (aiResponse.action_intent) {
                await executeOrDraftSkill(aiResponse.action_intent);
            }
        }

        isBusy = false;
    }, 10000); // Check every 10 seconds
}

async function handleInterrupt(chatMessage) {
    console.log(`[INTERRUPT] Received chat: ${chatMessage}`);
    isBusy = true; // Block idle loop

    // In a full implementation, we might stop the current pathfinder or bot action here
    bot.pathfinder.stop();

    const state = buildWorldState();
    if (state) {
        state.current_internal_goal = "Respond to sibling's chat immediately.";
        const aiResponse = await callGemini(state);
        if (aiResponse) {
            console.log("[GEMINI INTERRUPT RESPONSE]", aiResponse);
            if (aiResponse.chat) {
                bot.chat(aiResponse.chat);
            }
            if (aiResponse.action_intent) {
                await executeOrDraftSkill(aiResponse.action_intent);
            }
        }
    }

    lastPlayerChat = ""; // Clear after handling
    isBusy = false;
}

async function executeOrDraftSkill(intent) {
    console.log(`[SKILL] Request to execute: ${intent}`);

    // Convert intent to a valid filename
    const sanitizedIntent = intent.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30);
    const skillPath = path.join(__dirname, 'skills', `${sanitizedIntent}.js`);

    if (fs.existsSync(skillPath)) {
        console.log(`[SKILL] Found existing skill: ${sanitizedIntent}.js`);
        try {
            const skill = require(skillPath);
            await skill(bot);
            console.log(`[SKILL] Successfully executed: ${sanitizedIntent}.js`);
        } catch (error) {
            console.error(`[SKILL ERROR] Error executing ${sanitizedIntent}.js:`, error);
            await selfHealSkill(sanitizedIntent, skillPath, error);
        }
    } else {
        console.log(`[SKILL] Drafting new skill: ${sanitizedIntent}.js`);
        await draftAndExecuteSkill(intent, sanitizedIntent, skillPath);
    }
}

async function draftAndExecuteSkill(intent, sanitizedIntent, skillPath) {
    const prompt = `
You are a code generation module for a Mineflayer bot.
Write a CommonJS module that exports a single asynchronous function which takes the 'bot' instance as an argument.
The function should accomplish the following intent: "${intent}".
Return ONLY valid JavaScript code. Do not include markdown formatting like \`\`\`javascript or \`\`\`.
Do not include any explanation.

Example format:
module.exports = async (bot) => {
    // your code here
};
`;
    try {
        const result = await model.generateContent(prompt);
        let code = result.response.text();

        // Strip markdown if the model included it anyway
        code = code.replace(/^```(javascript)?\n/i, '').replace(/```$/, '');

        fs.writeFileSync(skillPath, code);
        console.log(`[SKILL] Saved new skill to ${skillPath}`);

        // Execute the newly drafted skill
        const skill = require(skillPath);
        await skill(bot);
        console.log(`[SKILL] Successfully executed drafted skill: ${sanitizedIntent}.js`);
    } catch (error) {
        console.error(`[SKILL ERROR] Error generating or executing new skill ${sanitizedIntent}.js:`, error);
        await selfHealSkill(sanitizedIntent, skillPath, error);
    }
}

async function selfHealSkill(sanitizedIntent, skillPath, executionError) {
    console.log(`[SKILL HEALING] Attempting to self-heal skill: ${sanitizedIntent}.js`);

    let existingCode = "";
    if (fs.existsSync(skillPath)) {
        existingCode = fs.readFileSync(skillPath, 'utf8');
    }

    const prompt = `
You are a debugging module for a Mineflayer bot.
The following Mineflayer skill script failed to execute.
Intent: "${sanitizedIntent}"
Error: "${executionError.message || executionError}"

Existing Code:
${existingCode}

Please rewrite the script to fix the error. Return ONLY valid JavaScript code. Do not include markdown formatting.
`;

    try {
        const result = await model.generateContent(prompt);
        let code = result.response.text();

        code = code.replace(/^```(javascript)?\n/i, '').replace(/```$/, '');

        fs.writeFileSync(skillPath, code);
        console.log(`[SKILL HEALING] Saved healed skill to ${skillPath}`);

        // Important: invalidate the require cache so we load the new version
        delete require.cache[require.resolve(skillPath)];

        // Try executing again
        const skill = require(skillPath);
        await skill(bot);
        console.log(`[SKILL HEALING] Successfully executed healed skill: ${sanitizedIntent}.js`);
    } catch (error) {
        console.error(`[SKILL HEALING ERROR] Failed to heal skill ${sanitizedIntent}.js:`, error);
    }
}

createBot();
