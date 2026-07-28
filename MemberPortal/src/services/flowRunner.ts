/**
 * flowRunner — drives a Descope Flow **headlessly**, so the app renders its own
 * native screens instead of Descope's web UI.
 *
 * The flow still runs in full on Descope's side: its logic, its OTP delivery,
 * and — the reason it exists in this design — its HTTP connectors calling the
 * BFF at each phase. What we opt out of is only the *rendering*. Each call
 * returns a `FlowResponse` describing the screen the flow wants shown; we map
 * that to one of our own components (see `screens/register/flowScreens.ts`),
 * collect the input natively, and hand it back with `next`.
 *
 * That's what the `isCustomScreen` argument on `flow.start` / `flow.next`
 * signals to the server.
 *
 * Framework-agnostic, like descopeService: build one with
 * `createFlowRunner(sdk)` where `sdk` is what `useDescope()` returns.
 */
import type { useDescope } from '@descope/react-native-sdk';
import type { FlowResponse, JWTResponse } from '@descope/core-js-sdk';

type Sdk = ReturnType<typeof useDescope>;

/** Everything a native screen needs to render itself and submit back. */
export type FlowScreen = {
  executionId: string;
  stepId: string;
  /** The flow's screen ID — what we map to a native component. */
  screenId: string;
  /** Server-side screen state (masked email, error text the flow set, etc.). */
  state: Record<string, unknown>;
  /** A validation/auth error from the previous submission, if any. */
  error?: string;
};

export type FlowResult =
  | { kind: 'screen'; screen: FlowScreen }
  | { kind: 'completed'; jwt: JWTResponse }
  | { kind: 'error'; error: string };

/** Input sent back into the flow — flat key/value, keys defined by the flow. */
export type FlowInput = Record<string, string | number | boolean>;

const GENERIC_ERROR = 'Something went wrong. Please try again.';

function errorText(response: FlowResponse | undefined, fallback: string): string {
  return response?.error?.description || response?.error?.message || fallback;
}

/**
 * Turns a raw FlowResponse into one of the three things the UI cares about:
 * render a screen, finish with a session, or fail.
 */
function interpret(response: FlowResponse | undefined): FlowResult {
  if (!response) {
    return { kind: 'error', error: GENERIC_ERROR };
  }

  if (response.status === 'completed') {
    // The flow finished — `authInfo` carries the session it minted, enriched
    // with whatever custom claims the flow mapped in (subscriberId, planId).
    if (!response.authInfo) {
      return {
        kind: 'error',
        error: 'Registration finished but returned no session. Check that the flow ends by ' +
          'issuing a session JWT.',
      };
    }
    return { kind: 'completed', jwt: response.authInfo };
  }

  if (response.status === 'failed') {
    return { kind: 'error', error: errorText(response, GENERIC_ERROR) };
  }

  if (response.action === 'screen' && response.screen) {
    return {
      kind: 'screen',
      screen: {
        executionId: response.executionId,
        stepId: response.stepId,
        screenId: response.screen.id,
        state: response.screen.state ?? {},
        // A wrong OTP (say) comes back as an error *alongside* the same
        // screen, not as a failure — surface it so the screen can show it.
        error: response.error ? errorText(response, GENERIC_ERROR) : undefined,
      },
    };
  }

  // redirect / webauthn / poll / nativeBridge: all of these need UI or native
  // handling this runner doesn't do. A registration flow built to the agreed
  // four phases won't hit them — if one shows up, the flow has a step that
  // can't be rendered natively, and saying so beats a blank screen.
  return {
    kind: 'error',
    error:
      `This registration step ("${response.action}") can't be shown in the app's own UI. ` +
      'Check the flow for a step that needs a browser redirect or WebAuthn.',
  };
}

export function createFlowRunner(sdk: Sdk) {
  return {
    /** Begins the flow and returns its first screen. */
    async start(flowId: string, input?: FlowInput): Promise<FlowResult> {
      try {
        const resp = await sdk.flow.start(
          flowId,
          {}, // options
          undefined, // conditionInteractionId
          undefined, // interactionId
          undefined, // componentsVersion
          undefined, // flowVersions
          input,
          true, // isCustomScreen — we render the screens ourselves
        );
        if (!resp.ok) {
          return {
            kind: 'error',
            error: resp.error?.errorDescription ?? 'Could not start registration.',
          };
        }
        return interpret(resp.data);
      } catch (e) {
        const err = e as { message?: string } | undefined;
        return { kind: 'error', error: err?.message ?? 'Could not start registration.' };
      }
    },

    /**
     * Submits a screen's input and returns whatever the flow wants next.
     * `interactionId` names the action taken (the flow's submit button, its
     * "resend code" link, and so on) — see `flowScreens.ts`.
     */
    async next(
      screen: FlowScreen,
      interactionId: string,
      input?: FlowInput,
    ): Promise<FlowResult> {
      try {
        const resp = await sdk.flow.next(
          screen.executionId,
          screen.stepId,
          interactionId,
          undefined, // version
          undefined, // componentsVersion
          input,
          true, // isCustomScreen
        );
        if (!resp.ok) {
          return {
            kind: 'error',
            error: resp.error?.errorDescription ?? GENERIC_ERROR,
          };
        }
        return interpret(resp.data);
      } catch (e) {
        const err = e as { message?: string } | undefined;
        return { kind: 'error', error: err?.message ?? GENERIC_ERROR };
      }
    },
  };
}

export type FlowRunner = ReturnType<typeof createFlowRunner>;
