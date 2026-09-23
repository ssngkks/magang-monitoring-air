import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { AIAnalytics } from './pages/AIAnalytics';
import { Alerts } from './pages/Alerts';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { DevicesManagement } from './pages/DevicesManagement';
import { WaterQualityDetail } from './pages/WaterQualityDetail';
import { EnvironmentDetail } from './pages/EnvironmentDetail';
import { WaterPhysicalDetail } from './pages/WaterPhysicalDetail';
import { NotFound } from './pages/NotFound';

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: Login,
  },
  {
    path: '/signup',
    Component: Signup,
  },
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: 'water-quality', Component: WaterQualityDetail },
      { path: 'environment', Component: EnvironmentDetail },
      { path: 'physical', Component: WaterPhysicalDetail },
      { path: 'ai-analytics', Component: AIAnalytics },
      { path: 'alerts', Component: Alerts },
      { path: 'devices', Component: DevicesManagement },
      { path: 'reports', Component: Reports },
      { path: 'settings', Component: Settings },
      { path: '*', Component: NotFound },
    ],
  },
]);
