import { LocalAiBrain } from '../core/brain';

async function main() {
  const brain = new LocalAiBrain();
  console.log("🧠 Connecting to Local AI (Ollama)...");
  
  try {
    const reply = await brain.chat([
      { role: 'user', content: 'Hello! Please introduce yourself in one short sentence.' }
    ]);
    console.log("🤖 AI Reply:", reply);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
