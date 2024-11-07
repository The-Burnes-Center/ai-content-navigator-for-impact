import { AppConfig } from "../types";
import { SessionsClient } from "./sessions-client";
import { UserFeedbackClient } from "./user-feedback-client";

export class ApiClient {

  private _sessionsClient: SessionsClient | undefined;
  
  private _userFeedbackClient: UserFeedbackClient | undefined;

  public get sessions() {
    if (!this._sessionsClient) {
      this._sessionsClient = new SessionsClient(this._appConfig);

    }

    return this._sessionsClient;
  }



  public get userFeedback() {
    if (!this._userFeedbackClient) {
      this._userFeedbackClient = new UserFeedbackClient(this._appConfig); 

    }

    return this._userFeedbackClient;
  }

  constructor(protected _appConfig: AppConfig) {}
}
