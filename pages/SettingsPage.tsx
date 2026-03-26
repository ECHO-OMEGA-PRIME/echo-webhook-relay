import React, { useState } from 'react';
import BaseLayout from '../layouts/BaseLayout';
import Input from '../components/Input';

const SettingsPage: React.FC = () => {
  const [username, setUsername] = useState('');

  const handleUsernameChange = (value: string) => {
    setUsername(value);
  };

  return (
    <BaseLayout>
      <h1 className="page-title">Settings Page</h1>
      <Input label="Username" value={username} onChange={handleUsernameChange} />
    </BaseLayout>
  );
};

export default SettingsPage;