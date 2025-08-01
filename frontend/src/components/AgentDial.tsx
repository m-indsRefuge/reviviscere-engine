import React, { useState, useEffect } from 'react';

type AgentDialProps = {
  selectedAgent: string;
  onNext: () => void;
  className?: string;
};

const abbreviations: Record<string, string> = {
  cortex: 'C',
  glia: 'G',
  forge: 'F',
  watchtower: 'WT',
};

const AgentDial: React.FC<AgentDialProps> = ({ selectedAgent, onNext, className }) => {
  const [rotating, setRotating] = useState(false);

  const handleClick = () => {
    setRotating(true);
    onNext();
  };

  useEffect(() => {
    if (rotating) {
      const timer = setTimeout(() => setRotating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [rotating]);

  // Get abbreviation or fallback to first letter uppercase
  const label = abbreviations[selectedAgent.toLowerCase()] || selectedAgent[0].toUpperCase();

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${className ?? ''} relative select-none focus:outline-none focus:ring-2 focus:ring-red-500`}
      aria-label={`Toggle Agent: ${selectedAgent}`}
      title={`Current Agent: ${selectedAgent}`}
      style={{
        transform: rotating ? 'rotate(120deg)' : 'rotate(0deg)',
        transition: 'transform 0.3s ease-in-out',
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="32"
          cy="32"
          r="30"
          stroke="#4B5563"
          strokeWidth="4"
          fill="#1F2937"
          filter="url(#shadow)"
        />
        <circle
          cx="32"
          cy="12"
          r="6"
          fill="#EF4444"
          filter="url(#glow)"
        />
        <defs>
          <filter id="shadow" x="-10" y="-10" width="84" height="84" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.5" />
          </filter>
          <filter id="glow" x="-10" y="-10" width="24" height="24" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#EF4444" floodOpacity="0.8" />
          </filter>
        </defs>
      </svg>

      <span className="relative z-10 text-xl font-bold text-red-400 select-none pointer-events-none">
        {label}
      </span>
    </button>
  );
};

export default AgentDial;
