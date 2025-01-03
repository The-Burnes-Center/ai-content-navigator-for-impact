import { SelectProps } from "@cloudscape-design/components";
import { CognitoHostedUIIdentityProvider } from "@aws-amplify/auth";

export interface AppConfig {
  Auth: {
    region: string,
    userPoolId: string,
    userPoolWebClientId: string,
    oauth: {
      domain: string,
      scope: string[],
      redirectSignIn: string, // Dynamic string
      responseType: string,
    }
  },
  httpEndpoint: string, // Allow dynamic values
  wsEndpoint: string,   // Allow dynamic values
  federatedSignInProvider: string, // Use "string" for flexibility
}


// export interface NavigationPanelState {
//   collapsed?: boolean;
//   collapsedSections?: Record<number, boolean>;
// }

export type LoadingStatus = "pending" | "loading" | "finished" | "error";
export type RagDocumentType =
  | "file"
  | "text"
  | "qna"
  | "website"
  | "rssfeed"
  | "rsspost";
