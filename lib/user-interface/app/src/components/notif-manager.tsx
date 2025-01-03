import * as React from "react";
import { createContext, useState, useContext } from "react";
import { v4 as uuidv4 } from 'uuid';  // Import the UUID function

// Create a context for the notification manager
export const NotificationContext = createContext({
  notifications: [],
  addNotification: (type, content) => {String},
  removeNotification: (id) => {}
});

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = (type, content) => {
    const id = uuidv4();
    console.log("Generated notification ID:", id);

    setNotifications((prev) => [
      ...prev,
      {
        id,
        type,
        content,
        date: new Date().getTime(),
        dismissible: true,
        dismissLabel: "Hide notification",
        onDismiss: () => removeNotification(id),
      },
    ]);

    console.log("Notifications after add:", notifications);
    return id;
  };

  const removeNotification = (id) => {
    setNotifications((prev) => {
      const updatedNotifications = prev.filter((notif) => notif.id !== id);
      console.log("Removing notification ID:", id);
      console.log("Notifications after remove:", updatedNotifications);
      return updatedNotifications;
    });
  };

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

  

export const useNotifications = () => useContext(NotificationContext);
