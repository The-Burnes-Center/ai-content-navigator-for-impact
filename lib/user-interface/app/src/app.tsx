import { useContext } from "react";
import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import { AppContext } from "./common/app-context";
import GlobalHeader from "./components/global-header";
import Playground from "./pages/chatbot/playground/playground";
import "./styles/app.scss";

function App() {
  const appContext = useContext(AppContext);
  const Router = BrowserRouter;


  return (
    <div style={{ height: "100%" }}>
      <Router>
        <GlobalHeader />
        <div style={{ height: "56px", backgroundColor: "#000716" }}>&nbsp;</div>
        <div style={{top: "0px"}}>
          <Routes>            
            <Route
                index
                path="/"
                element={<Navigate to={`/chatbot/playground`} replace />}
            />            
            <Route path="/chatbot" element={<Outlet />}>
              <Route path="playground" element={<Playground />} />             
            </Route>            
            <Route path="*" element={<Navigate to={`/chatbot/playground`} replace />} />
          </Routes>
        </div>
      </Router>
    </div>
  );
}

export default App;
