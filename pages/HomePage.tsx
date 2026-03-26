import React from 'react';
import BaseLayout from '../layouts/BaseLayout';
import Alert from '../components/Alert';

const HomePage: React.FC = () => {
  return (
    <BaseLayout>
      <h1 className="page-title">Home Page</h1>
      <Alert type="success" message="Welcome to the home page!" />
    </BaseLayout>
  );
};

export default HomePage;