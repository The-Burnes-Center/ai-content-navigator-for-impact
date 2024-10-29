import { StatusIndicatorProps } from "@cloudscape-design/components";

export const languageList = [
  { value: "simple", label: "Simple" },
  { value: "arabic", label: "Arabic" },
  { value: "armenian", label: "Armenian" },
  { value: "basque", label: "Basque" },
  { value: "catalan", label: "Catalan" },
  { value: "danish", label: "Danish" },
  { value: "dutch", label: "Dutch" },
  { value: "english", label: "English" },
  { value: "finnish", label: "Finnish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "greek", label: "Greek" },
  { value: "hindi", label: "Hindi" },
  { value: "hungarian", label: "Hungarian" },
  { value: "indonesian", label: "Indonesian" },
  { value: "irish", label: "Irish" },
  { value: "italian", label: "Italian" },
  { value: "lithuanian", label: "Lithuanian" },
  { value: "nepali", label: "Nepali" },
  { value: "norwegian", label: "Norwegian" },
  { value: "portuguese", label: "Portuguese" },
  { value: "romanian", label: "Romanian" },
  { value: "russian", label: "Russian" },
  { value: "serbian", label: "Serbian" },
  { value: "spanish", label: "Spanish" },
  { value: "swedish", label: "Swedish" },
];

export abstract class Labels {
  static languageMap = new Map(languageList.map((l) => [l.value, l.label]));

  

  static statusTypeMap: Record<string, StatusIndicatorProps.Type> = {
    unknown: "warning",
    pending: "pending",
    submitted: "pending",
    creating: "in-progress",
    ready: "success",
    created: "success",
    processing: "in-progress",
    processed: "success",
    deleting: "in-progress",
    error: "error",
    disabled: "stopped",
    enabled: "success",
  };

  static statusMap: Record<string, string> = {
    unknown: "Unknown",
    pending: "Pending",
    submitted: "Submitted",
    creating: "Creating",
    ready: "Ready",
    created: "Created",
    processing: "Processing",
    processed: "Processed",
    deleting: "Deleting",
    error: "Error",
    disabled: "Disabled",
    enabled: "Enabled",
  }; 

}

export const feedbackCategories = [
  {label: "Example 1", value:"rp", disabled: false},
  {label: "Example 2", value:"rf", disabled: false},  
]

export const feedbackTypes = [
  {label: "Accuracy", value:"accuracy", disabled: false},
  {label: "Relevance", value:"relevance", disabled: false},
  {label: "Clarity", value:"clarity", disabled: false},
  {label: "Formatting", value:"completeness", disabled: false},
  {label: "Incomplete", value:"incomplete", disabled: false},
  {label: "Other", value:"other", disabled: false}
]


export const API = "https://u95wm1svh0.execute-api.us-east-1.amazonaws.com/test"

export const CHATBOT_NAME = "EEA Grants Navigator";
