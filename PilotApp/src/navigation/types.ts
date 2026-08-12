export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  Passkey: { mode?: 'signin' | 'signup' } | undefined;
};

export type AppStackParamList = {
  Portal: undefined;
  Passkey: { mode?: 'signin' | 'signup' } | undefined;
};
