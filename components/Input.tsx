import React, { useState } from 'react';

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const Input: React.FC<InputProps> = ({ label, value, onChange }) => {
  const [focused, setFocused] = useState(false);

  const handleBlur = () => {
    setFocused(false);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  return (
    <div className="input-group">
      <label className="input-label">{label}</label>
      <input
        className={`input-field ${focused ? 'focused' : ''}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />
    </div>
  );
};

export default Input;