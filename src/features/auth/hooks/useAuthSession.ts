import { useEffect, useState } from 'react';
import { auth, onAuthStateChanged, type User } from '../../../firebase';

export function useAuthSession() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return {
    user,
    isAuthLoading,
  };
}
