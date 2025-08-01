import { useState, useRef, useEffect } from 'react';
import AgentDial from './AgentDial';
import PromptInput from './PromptInput';

type Message = {
  sender: 'user' | 'agent';
  text: string;
};

export default function ChatInterface() {
  const agents = ['cortex', 'glia', 'forge', 'watchtower'];
  const [selectedAgent, setSelectedAgent] = useState('cortex');
  const [prompt, setPrompt] = useState('');
  const [responses, setResponses] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const nextAgent = async () => {
    const index = agents.indexOf(selectedAgent);
    const next = (index + 1) % agents.length;
    const nextAgent = agents[next];

    setSelectedAgent(nextAgent);

    try {
      await fetch('https://cortex-agent-worker.nolanaug.workers.dev/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: nextAgent }),
      });
    } catch (error) {
      console.error('Failed to update agent config:', error);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim()) return;

    setResponses((prev) => [...prev, { sender: 'user', text: prompt }]);

    try {
      const response = await fetch('https://cortex-agent-worker.nolanaug.workers.dev/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.body) throw new Error('No response body from server');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedText = '';

      setResponses((prev) => [...prev, { sender: 'agent', text: '' }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value);
          accumulatedText += chunk;

          setResponses((prev) => {
            const newResponses = [...prev];
            newResponses[newResponses.length - 1] = { sender: 'agent', text: accumulatedText };
            return newResponses;
          });
        }
      }
    } catch (err) {
      setResponses((prev) => [
        ...prev,
        { sender: 'agent', text: `Error: ${(err as Error).message}` },
      ]);
    }

    setPrompt('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responses]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-white">
      <header className="py-4 flex justify-center border-b border-gray-800">
        <h1
          className="text-3xl font-extrabold text-red-500"
          style={{
            WebkitTextStroke: '1px black',
            textShadow: '0 0 4px #ff4d4d, 0 0 8px #ff4d4d, 0 0 12px #ff1a1a',
          }}
        >
          Reviviscere_Mind-Space
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 w-full flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-4">
          {responses.map((msg, i) => (
            <div
              key={i}
              className={`w-full flex ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[75%] px-4 py-3 rounded-lg shadow-sm whitespace-pre-wrap text-sm ${
                  msg.sender === 'user'
                    ? 'bg-gray-900 text-white border border-red-500'
                    : 'bg-[#343541] text-gray-200'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="w-full border-t border-gray-800 py-4 px-4 flex justify-center">
        <div className="w-full max-w-3xl flex items-center space-x-8">
          <div className="flex-shrink-0">
            <AgentDial
              selectedAgent={selectedAgent}
              onNext={nextAgent}
              className="w-16 h-16 rounded-full bg-gray-800 border-4 border-gray-700 shadow-inner flex items-center justify-center cursor-pointer hover:border-red-500 hover:shadow-lg transition"
            />
          </div>

          <div className="flex-1">
            <PromptInput value={prompt} onChange={setPrompt} onSend={handleSend} />
          </div>
        </div>
      </footer>
    </div>
  );
}
