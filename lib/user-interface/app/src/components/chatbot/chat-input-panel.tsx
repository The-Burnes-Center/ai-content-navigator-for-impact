import React, {
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  Container,
  SpaceBetween,
  Spinner,
  Box,
  Select,
  SelectProps,
  Link,
  Flashbar,
} from "@cloudscape-design/components";
import { useNavigate } from "react-router-dom";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import TextareaAutosize from "react-textarea-autosize";
import { ReadyState } from "react-use-websocket";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import styles from "../../styles/chat.module.scss";
import { v4 as uuidv4 } from "uuid";
import {
  ChatBotConfiguration,
  ChatBotHistoryItem,
  ChatBotMessageType,
  ChatInputState,
  ImageFile,
} from "./types";
import { assembleHistory } from "./utils";
import { SessionRefreshContext } from "../../common/session-refresh-context";
import Modal from "@cloudscape-design/components/modal";

const defaultPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`;

const farmPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a farm. Always provide more than 3 grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`;

const nonprofitPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a nonprofit. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`;

const businessPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a business. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`;

const townPrompt = `Based on the project and organization description provided by the user, recommend the most relevant specific grant programs offered by the Massachusetts Energy and Environment Office that would be a good fit for a municipality or town. Always provide more than three grant programs that could be related to the users search, formatted as follows:
- **Grant Program Name (as a bold header):**
  - A 3 sentence description of the grant program.
  - **Specific Details:**
    - **Deadline Date:** [Insert Deadline Date] Be as specific as possible
    - **Target Audience:** [Insert Target Audience]
    - **Funding Amount:** [Insert Funding Amount]
    - **Match Requirement:** [Insert Match Requirement]
  - **Additional Information:** Include any extra information that might be important for potential applicants to be aware of. Do not include a link unless certain of its validity.

Ensure each grant program is clearly and concisely described, highlighting its relevance to the users project and organization.`;

const AIWarning = () => {
  return (
    <Box textAlign="center">
      <h4 style={{ fontFamily: "Calibri, sans-serif", fontWeight: "500", fontSize: 15 }}>
        This tool uses AI assistive technology to provide information about grants, based on the input query. To learn more, try this link: <a href="https://www.firecrawl.dev/" target="_blank">FireCrawl</a> 
      </h4>
      <h4 style={{ fontFamily: "Calibri, sans-serif", fontWeight: "500", fontSize: 15 }}>
        AI Models can make mistakes. Make sure to verify all information.
      </h4>
    </Box>
  );
};

export interface ChatInputPanelProps {
  running: boolean;
  setRunning: Dispatch<SetStateAction<boolean>>;
  session: { id: string; loading: boolean };
  messageHistory: ChatBotHistoryItem[];
  setMessageHistory: (history: ChatBotHistoryItem[]) => void;
  configuration: ChatBotConfiguration;
  setConfiguration: Dispatch<React.SetStateAction<ChatBotConfiguration>>;
}

export abstract class ChatScrollState {
  static userHasScrolled = false;
  static skipNextScrollEvent = false;
  static skipNextHistoryUpdate = false;
}

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  feedbackType: string;
  setFeedbackType: Dispatch<SetStateAction<string>>;
  feedbackTopic: string;
  setFeedbackTopic: Dispatch<SetStateAction<string>>;
  feedbackMessage: string;
  setFeedbackMessage: Dispatch<SetStateAction<string>>;
}

const FeedbackModal = React.memo(({
  visible,
  onClose,
  onSubmit,
  feedbackType,
  setFeedbackType,
  feedbackTopic,
  setFeedbackTopic,
  feedbackMessage,
  setFeedbackMessage,
}: FeedbackModalProps) => {
  const typeOptions: SelectProps.Option[] = [
    { label: "General", value: "General" },
    { label: "UI", value: "UI" },
    { label: "Accuracy", value: "Accuracy" },
    { label: "Unhappy", value: "Unhappy" },
    { label: "Other", value: "Other" },
  ];

  const topicOptions: SelectProps.Option[] = [
    { label: "UI", value: "UI" },
    { label: "Functionality", value: "Functionality" },
    { label: "Accuracy", value: "Accuracy" },
    { label: "Other", value: "Other" },
  ];

  return (
    <Modal
      visible={visible}
      onDismiss={onClose}
      header="Submit Feedback!"
      footer={
        <Box float="right">
          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit}>
            Submit
          </Button>
        </Box>
      }
      data-model-style = "modal"
    >
      <Box margin={{ bottom: "m" }}>
        <Select
          options={typeOptions}
          selectedOption={typeOptions.find((opt) => opt.value === feedbackType) || null}
          onChange={({ detail }) => setFeedbackType(detail.selectedOption.value || "")}
          placeholder="Select Feedback Type"
        />
      </Box>
      <Box margin={{ bottom: "m" }}>
        <Select
          options={topicOptions}
          selectedOption={topicOptions.find((opt) => opt.value === feedbackTopic) || null}
          onChange={({ detail }) => setFeedbackTopic(detail.selectedOption.value || "")}
          placeholder="Select Feedback Topic"
        />
      </Box>
      <Box>
        <TextareaAutosize
          value={feedbackMessage}
          onChange={(e) => setFeedbackMessage(e.target.value)}
          placeholder="Enter Feedback Message"
          minRows={3}
          style={{
            width: "100%",
            padding: "8px",
            fontSize: "14px",
            fontFamily: "Arial, sans-serif",
            borderColor: "#ccc",
          }}
        />
      </Box>
    </Modal>
  );
});

interface FeedbackTabProps {
  onFeedbackDown: () => void;
  onFeedbackUp: () => void;
}
// className={styles.info_bar}

const FeedbackTab = React.memo(({ onFeedbackDown, onFeedbackUp }: FeedbackTabProps) => {
  return (
    <div style ={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center"}}>
    <div style={{border: "0.01rem outset #000716", borderRadius: "10px", display:"inline-block", padding: "4px 8px", flexDirection:"column", justifyContent:"center", alignItems:"center", textAlign: "center"}} >
    <Box>
      <h4 style={{ fontFamily: "Calibri, sans-serif", fontWeight: "500", fontSize: 15, justifyContent:"center", alignItems:"center" }}>
        Did you find the grant info you're looking for?
      </h4>
      <Button variant="link" onClick={onFeedbackUp}>
        Yes
      </Button>
      <Button variant="link" onClick={onFeedbackDown}>
        No
      </Button>
    </Box>
  </div>
  </div>
  );
});

interface FeedbackContainerProps {
  apiClient: ApiClient;
  showFlashMessage: (type: "info" | "success" | "warning" | "error", content: React.ReactNode, duration?: number) => void;
}

const FeedbackContainer: React.FC<FeedbackContainerProps> = ({ apiClient, showFlashMessage }) => {
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackTopic, setFeedbackTopic] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const handleFeedbackUp = () => {
    // Positive feedback
    showFlashMessage("success", "Thank you for your valuable feedback!");
    console.log("Positive feedback received");
  };

  const handleFeedbackDown = () => {
    setFeedbackModalVisible(true);
  };

  const submitFeedback = async () => {
    if (!feedbackType || !feedbackTopic || !feedbackMessage) {
      showFlashMessage("error", "Please fill out all fields before submitting feedback.");
      return;
    }
    setFeedbackModalVisible(false);
    showFlashMessage("success", "Feedback submitted successfully!");
    /*
    const feedback = {
      type: feedbackType,
      topic: feedbackTopic,
      message: feedbackMessage
    };
    try {
      await apiClient.userFeedback.sendUserFeedback(feedback);
      showFlashMessage("success", "Feedback submitted successfully!");
      setFeedbackModalVisible(false);
    } catch (error) {
      showFlashMessage("error", "Failed to submit feedback. Please try again.");
    }
      */
  };

  return (
    <>
      <FeedbackTab onFeedbackUp={handleFeedbackUp} onFeedbackDown={handleFeedbackDown} />
      <FeedbackModal
        visible={feedbackModalVisible}
        onClose={() => setFeedbackModalVisible(false)}
        onSubmit={submitFeedback}
        feedbackType={feedbackType}
        setFeedbackType={setFeedbackType}
        feedbackTopic={feedbackTopic}
        setFeedbackTopic={setFeedbackTopic}
        feedbackMessage={feedbackMessage}
        setFeedbackMessage={setFeedbackMessage}
      />
    </>
  );
};

export default function ChatInputPanel(props: ChatInputPanelProps) {
  const appContext = useContext(AppContext);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const apiClient = new ApiClient(appContext);
  const navigate = useNavigate();
  const { transcript, listening, browserSupportsSpeechRecognition } = useSpeechRecognition();
  const [state, setState] = useState<ChatInputState>({
    value: "",
    systemPrompt: defaultPrompt,
  });
  const [activeButton, setActiveButton] = useState<string>("General");
  const [selectedType, setSelectedType] = useState<SelectProps.Option | null>(null);
  const [configDialogVisible, setConfigDialogVisible] = useState(false);
  const [imageDialogVisible, setImageDialogVisible] = useState(false);
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.OPEN);
  const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);

  const [flashItems, setFlashItems] = useState([]);

  // Helper function to show flash messages
  const showFlashMessage = (
    type: "info" | "success" | "warning" | "error",
    content: React.ReactNode,
    duration = 3000
  ) => {
    const id = `message_${Date.now()}`;
    setFlashItems([{
      type: type,
      dismissible: true,
      dismissLabel: "Dismiss message",
      onDismiss: () => setFlashItems([]),
      content: content,
      id: id
    }]);

    setTimeout(() => {
      setFlashItems([]);
    }, duration);
  };

  useEffect(() => {
    messageHistoryRef.current = props.messageHistory;
  }, [props.messageHistory]);

  useEffect(() => {
    if (transcript) {
      setState((state) => ({ ...state, value: transcript }));
    }
  }, [transcript]);

  const handleSendMessage = async () => {
    if (props.running) return;
    if (readyState !== ReadyState.OPEN) return;
    ChatScrollState.userHasScrolled = false;

    const messageToSend = state.value.trim();
    setState({ value: "", systemPrompt: defaultPrompt });
    try {
      props.setRunning(true);
      let receivedData = "";

      messageHistoryRef.current = [
        {
          type: ChatBotMessageType.Human,
          content: messageToSend,
          metadata: {
            ...props.configuration,
          },
          tokens: [],
        },
        {
          type: ChatBotMessageType.AI,
          tokens: [],
          content: receivedData,
          metadata: {},
        },
      ];
      props.setMessageHistory(messageHistoryRef.current);

      let firstTime = false;
      if (messageHistoryRef.current.length < 3) {
        firstTime = true;
      }

      const wsUrl = appContext.wsEndpoint + "/";
      const ws = new WebSocket(wsUrl);

      let incomingMetadata: boolean = false;
      let sources = {};

      setTimeout(() => {
        if (receivedData == "") {
          ws.close();
          messageHistoryRef.current.pop();
          messageHistoryRef.current.push({
            type: ChatBotMessageType.AI,
            tokens: [],
            content: "Response timed out!",
            metadata: {},
          });
        }
      }, 60000);

      ws.addEventListener("open", function open() {
        console.log("Connected to the WebSocket server");
        const message = JSON.stringify({
          action: "getChatbotResponse",
          data: {
            userMessage: messageToSend,
            chatHistory: assembleHistory(messageHistoryRef.current.slice(0, -2)),
            systemPrompt: state.systemPrompt,
            projectId: "rkdg062824",
          },
        });
        ws.send(message);
      });

      ws.addEventListener("message", async function incoming(data) {
        if (data.data.includes("<!ERROR!>:")) {
          ws.close();
          return;
        }
        if (data.data == "!<|EOF_STREAM|>!") {
          incomingMetadata = true;
          return;
        }
        if (!incomingMetadata) {
          receivedData += data.data;
        } else {
          sources = { Sources: JSON.parse(data.data) };
          console.log(sources);
        }

        messageHistoryRef.current = [
          {
            type: ChatBotMessageType.Human,
            content: messageToSend,
            metadata: {
              ...props.configuration,
            },
            tokens: [],
          },
          {
            type: ChatBotMessageType.AI,
            tokens: [],
            content: receivedData,
            metadata: sources,
          },
          ...messageHistoryRef.current.slice(2),
        ];
        props.setMessageHistory(messageHistoryRef.current);
      });

      ws.addEventListener("error", function error(err) {
        console.error("WebSocket error:", err);
      });

      ws.addEventListener("close", async function close() {
        if (firstTime) {
          // if first time user tries to chat, delay refresh
          setTimeout(() => setNeedsRefresh(true), 1500);
        }
        props.setRunning(false);
        console.log("Disconnected from the WebSocket server");
      });
    } catch (error) {
      console.error("Error sending message:", error);
      alert(
        "Sorry, something has gone horribly wrong! Please try again or refresh the page."
      );
      props.setRunning(false);
    }
  };

  const handleClearSearch = () => {
    setState({ value: "", systemPrompt: defaultPrompt });
    props.setMessageHistory([]);
  };

  const connectionStatus = {
    [ReadyState.CONNECTING]: "Connecting",
    [ReadyState.OPEN]: "Open",
    [ReadyState.CLOSING]: "Closing",
    [ReadyState.CLOSED]: "Closed",
    [ReadyState.UNINSTANTIATED]: "Uninstantiated",
  }[readyState];

  const addMayflowerStyles = () => {
    const stylesheets = [
      "https://unpkg.com/@massds/mayflower-assets@13.1.0/css/global.min.css",
      "https://unpkg.com/@massds/mayflower-assets@13.1.0/css/layout.min.css",
      "https://unpkg.com/@massds/mayflower-assets@13.1.0/css/brand-banner.min.css",
    ];

    stylesheets.forEach((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
  };

  useEffect(() => {
    addMayflowerStyles();
  }, []);

  const selectPrompt = (type: string) => {
    setActiveButton(type);
    switch (type) {
      case "Farm":
        setState({ ...state, systemPrompt: farmPrompt });
        break;
      case "Town":
        setState({ ...state, systemPrompt: townPrompt });
        break;
      case "Nonprofit":
        setState({ ...state, systemPrompt: nonprofitPrompt });
        break;
      case "Business":
        setState({ ...state, systemPrompt: businessPrompt });
        break;
      default:
        setState({ ...state, systemPrompt: defaultPrompt });
    }
  };

  const typeOptions: SelectProps.Option[] = [
    { label: "Farm", value: "Farm" },
    { label: "Town", value: "Town" },
    { label: "Nonprofit", value: "Nonprofit" },
    { label: "Business", value: "Business" },
    { label: "Other", value: "General" },
  ];

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Flashbar for notifications */}
      <div
        style={{
          position: "fixed",
          zIndex: 100,
        }}
        >
          <Flashbar items={flashItems} />
        </div>
        

      <main style={{ flex: 1, overflowY: "auto"}}>
        <SpaceBetween direction="vertical" size="xs">
          <Container>
            <div className={`${styles.input_textarea_container} input_textarea_container`}>
              <span style={{ fontFamily: "Calibri, sans-serif", fontSize: 18, marginRight: "8px" }}>
                I am a
              </span>
              <Select
                options={typeOptions}
                selectedOption={selectedType}
                onChange={({ detail }) => {
                  setSelectedType(detail.selectedOption);
                  selectPrompt(detail.selectedOption.value || "General");
                }}
                placeholder="Select type"
                expandToViewport
              />
              <span style={{ fontFamily: "Calibri, sans-serif", fontSize: 18, marginLeft: "8px" }}>
                looking for grants for
              </span>
              <TextareaAutosize
                className={`${styles.input_textarea} input_textarea`}
                maxRows={6}
                minRows={1}
                spellCheck={true}
                autoFocus
                onChange={(e) => setState((state) => ({ ...state, value: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                value={state.value}
                placeholder={'Enter Search ex. "energy efficiency"'}
              />
              <Button
                disabled={
                  readyState !== ReadyState.OPEN ||
                  props.running ||
                  state.value.trim().length === 0
                }
                onClick={handleSendMessage}
                iconAlign="left"
                iconName={!props.running ? "search" : undefined}
                variant="primary"
              >
                {props.running ? (
                  <>
                    Loading&nbsp;&nbsp;
                    <Spinner />
                  </>
                ) : (
                  "Search"
                )}
              </Button>
              <Button onClick={handleClearSearch} iconAlign="left" iconName="close" variant="link">
                Clear
              </Button>
            </div>
          </Container>
          <div className={styles.info_bar}>
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ marginTop: "30px" }}>
                <AIWarning />
              </div>
            </div>
          </div>
        </SpaceBetween>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <main style={{ flex: 1, overflowY: "auto" }}>
            <FeedbackContainer apiClient={apiClient} showFlashMessage={showFlashMessage} />
          </main>
        </div>
      </main>
    </div>
  );
}
