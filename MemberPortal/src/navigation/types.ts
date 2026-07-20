export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Passkey: { mode: 'signin' | 'signup' } | undefined;
};

export type AppStackParamList = {
  Portal: undefined;
};
