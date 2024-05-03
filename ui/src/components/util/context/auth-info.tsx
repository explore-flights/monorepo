import { Spinner } from '@cloudscape-design/components';
import React, { createContext, useContext, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthInfo } from '../../../lib/api/api.model';

type AuthInfoGet = AuthInfo | null | undefined;
type AuthInfoSet = AuthInfo | null;
export type AuthInfoContextType = [AuthInfoGet, React.Dispatch<AuthInfoSet | ((prevState: AuthInfoGet) => AuthInfoSet)>];
const AuthInfoContext = createContext<AuthInfoContextType>([
  undefined,
  () => {},
]);

export function AuthInfoProvider({ value, children }: React.PropsWithChildren<{ value: AuthInfoContextType }>) {
  return (
    <AuthInfoContext.Provider value={value}>
      {children}
    </AuthInfoContext.Provider>
  );
}

export function useAuthInfo() {
  return useContext(AuthInfoContext);
}

const MustAuthInfoContext = createContext<AuthInfo>({
  sessionId: '',
  sessionCreationTime: new Date().toISOString(),
  issuer: '',
  idAtIssuer: '',
});

export function MustAuthInfoProvider({ children }: React.PropsWithChildren) {
  const [authInfo] = useAuthInfo();
  return useMemo(() => {
    if (authInfo === undefined) {
      return (<Spinner size={'large'} />);
    }

    if (authInfo === null) {
      return (<Navigate to={'/login'} replace={true} />);
    }

    return (
      <MustAuthInfoContext.Provider value={authInfo}>
        {children}
      </MustAuthInfoContext.Provider>
    );
  }, [children, authInfo]);
}

export function MustNotAuthInfo({ children }: React.PropsWithChildren) {
  const [authInfo] = useAuthInfo();
  return useMemo(() => {
    if (authInfo === undefined) {
      return (<Spinner size={'large'} />);
    }

    if (authInfo !== null) {
      return (<Navigate to={'/'} replace={true} />);
    }

    return children;
  }, [authInfo]);
}

export function useMustAuthInfo() {
  return useContext(MustAuthInfoContext);
}
