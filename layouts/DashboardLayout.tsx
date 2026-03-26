import React from 'react';
import BaseLayout from './BaseLayout';
import Sidebar from '../components/Sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <BaseLayout>
      <div className="dashboard-layout">
        <Sidebar />
        <main className="dashboard-content">{children}</main>
      </div>
    </BaseLayout>
  );
};

export default DashboardLayout;