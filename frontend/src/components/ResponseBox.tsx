type ResponseBoxProps = {
  response: string;
};

export default function ResponseBox({ response }: ResponseBoxProps) {
  return (
    <div className="w-full bg-[#343541] p-6 rounded-lg border border-[#3e3f4b] shadow-md">
      <p className="text-gray-200 leading-relaxed whitespace-pre-wrap font-sans">
        {response || '...'}
      </p>
    </div>
  );
}
