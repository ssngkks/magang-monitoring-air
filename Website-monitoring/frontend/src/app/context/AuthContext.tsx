import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, User as ApiUser } from '../lib/api';

interface User extends ApiUser {
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function withAvatar(user: ApiUser): User {
  return {
    ...user,
    avatar: user.avatar || (user as any).photo_url || '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Inisialisasi sinkron dari localStorage mencegah ditendang ke /login saat refresh halaman
  const [user, setUser] = useState<User | null>(() => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('api_token');
      if (storedUser && token) {
        return JSON.parse(storedUser);
      }
    } catch {
      localStorage.removeItem('user');
      localStorage.removeItem('api_token');
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return !!localStorage.getItem('api_token') && !localStorage.getItem('user');
  });

  useEffect(() => {
    const token = localStorage.getItem('api_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    api.me()
      .then(({ data }) => {
        const nextUser = withAvatar(data);
        setUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));
      })
      .catch((error) => {
        // Hanya hapus sesi jika token ditolak secara eksplisit (401 Unauthorized)
        // Jangan hapus sesi hanya karena timeout atau masalah jaringan sementara!
        if (error?.status === 401) {
          localStorage.removeItem('user');
          localStorage.removeItem('api_token');
          setUser(null);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const response = await api.login(email, password);
    const nextUser = withAvatar(response.data.user);
    localStorage.setItem('api_token', response.data.token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
    return true;
  };

  const signup = async (name: string, email: string, password: string): Promise<boolean> => {
    const response = await api.register(name, email, password);
    const nextUser = withAvatar(response.data.user);
    localStorage.setItem('api_token', response.data.token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
    return true;
  };

  const logout = () => {
    api.logout().catch(() => undefined);
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('api_token');
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
