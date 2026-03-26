import React from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import Button from '../components/Button';

const DashboardPage: React.FC = () => {
  return (
    <DashboardLayout>
      <h1 className="page-title">Dashboard Page</h1>
      <Button variant="primary" onClick={() => console.log('Button clicked!')}>
        Click me!
      </Button>
    </DashboardLayout>
  );
};

export default DashboardPage;