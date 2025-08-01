type PromptInputProps = {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
};

export default function PromptInput({ value, onChange, onSend }: PromptInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        className="w-full p-4 rounded-md bg-gray-800 text-white border border-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
        placeholder="Enter your prompt here..."
      />
      <button
        onClick={onSend}
        className="self-end px-6 py-3 bg-blue-600 rounded-md hover:bg-blue-700 transition"
      >
        Send
      </button>
    </div>
  );
}
