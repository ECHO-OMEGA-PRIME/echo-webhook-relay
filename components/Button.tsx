import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant: 'primary' | 'secondary' | 'danger';
}

const Button: React.FC<ButtonProps> = ({ children, onClick, variant }) => {
  const className = `btn-${variant}`;

  return (
    <button className={`btn ${className}`} onClick={onClick}>
      {children}
    </button>
  );
};

export default Button;