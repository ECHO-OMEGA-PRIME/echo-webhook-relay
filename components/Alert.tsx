import React from 'react';

interface AlertProps {
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
}

const Alert: React.FC<AlertProps> = ({ type, message }) => {
  const className = `alert-${type}`;

  return (
    <div className={`alert ${className}`}>
      <span className="alert-icon" />
      <span className="alert-message">{message}</span>
    </div>
  );
};

export default Alert;