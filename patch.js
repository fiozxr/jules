const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');

const replacement = `async function executeOrDraftSkill(intent) {
    console.log(\`[SKILL] Request to execute: \${intent}\`);

    // Convert intent to a valid filename
    const sanitizedIntent = intent.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30);
    const skillPath = path.join(__dirname, 'skills', \`\${sanitizedIntent}.js\`);

    if (fs.existsSync(skillPath)) {
        console.log(\`[SKILL] Found existing skill: \${sanitizedIntent}.js\`);
        try {
            const skill = require(skillPath);
            await skill(bot);
            console.log(\`[SKILL] Successfully executed: \${sanitizedIntent}.js\`);
        } catch (error) {
            console.error(\`[SKILL ERROR] Error executing \${sanitizedIntent}.js:\`, error);
            await selfHealSkill(sanitizedIntent, skillPath, error);
        }
    } else {
        console.log(\`[SKILL] Drafting new skill: \${sanitizedIntent}.js\`);
        await draftAndExecuteSkill(intent, sanitizedIntent, skillPath);
    }
}

async function draftAndExecuteSkill(intent, sanitizedIntent, skillPath) {
    const prompt = \\\`
You are a code generation module for a Mineflayer bot.
Write a CommonJS module that exports a single asynchronous function which takes the 'bot' instance as an argument.
The function should accomplish the following intent: "\${intent}".
Return ONLY valid JavaScript code. Do not include markdown formatting like \\\\\\\`\\\\\\\`\\\\\\\`javascript or \\\\\\\`\\\\\\\`\\\\\\\`.
Do not include any explanation.

Example format:
module.exports = async (bot) => {
    // your code here
};
\\\`;
    try {
        const result = await model.generateContent(prompt);
        let code = result.response.text();

        // Strip markdown if the model included it anyway
        code = code.replace(/^\\\\\\\`\\\\\\\`(javascript)?\\\\n/i, '').replace(/\\\\\\\`\\\\\\\`\\\\\\\`$/, '');

        fs.writeFileSync(skillPath, code);
        console.log(\`[SKILL] Saved new skill to \${skillPath}\`);

        // Execute the newly drafted skill
        const skill = require(skillPath);
        await skill(bot);
        console.log(\`[SKILL] Successfully executed drafted skill: \${sanitizedIntent}.js\`);
    } catch (error) {
        console.error(\`[SKILL ERROR] Error generating or executing new skill \${sanitizedIntent}.js:\`, error);
        await selfHealSkill(sanitizedIntent, skillPath, error);
    }
}

async function selfHealSkill(sanitizedIntent, skillPath, executionError) {
    console.log(\`[SKILL HEALING] Attempting to self-heal skill: \${sanitizedIntent}.js\`);

    let existingCode = "";
    if (fs.existsSync(skillPath)) {
        existingCode = fs.readFileSync(skillPath, 'utf8');
    }

    const prompt = \\\`
You are a debugging module for a Mineflayer bot.
The following Mineflayer skill script failed to execute.
Intent: "\${sanitizedIntent}"
Error: "\${executionError.message || executionError}"

Existing Code:
\${existingCode}

Please rewrite the script to fix the error. Return ONLY valid JavaScript code. Do not include markdown formatting.
\\\`;

    try {
        const result = await model.generateContent(prompt);
        let code = result.response.text();

        code = code.replace(/^\\\\\\\`\\\\\\\`(javascript)?\\\\n/i, '').replace(/\\\\\\\`\\\\\\\`\\\\\\\`$/, '');

        fs.writeFileSync(skillPath, code);
        console.log(\`[SKILL HEALING] Saved healed skill to \${skillPath}\`);

        // Important: invalidate the require cache so we load the new version
        delete require.cache[require.resolve(skillPath)];

        // Try executing again
        const skill = require(skillPath);
        await skill(bot);
        console.log(\`[SKILL HEALING] Successfully executed healed skill: \${sanitizedIntent}.js\`);
    } catch (error) {
        console.error(\`[SKILL HEALING ERROR] Failed to heal skill \${sanitizedIntent}.js:\`, error);
    }
}\`;

const newContent = content.replace(
    /\/\/ Dummy executeOrDraftSkill.*(\n.*)+createBot\(\);/s,
    replacement + '\n\ncreateBot();\n'
);

fs.writeFileSync('index.js', newContent);
