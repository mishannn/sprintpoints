import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import { App } from "./app/index";

const theme = createTheme({
  colors: {
    gray: [
      "#fafaf9",
      "#f5f5f4",
      "#e7e5e4",
      "#d6d3d1",
      "#a8a29e",
      "#78716c",
      "#57534e",
      "#44403c",
      "#292524",
      "#1c1917",
    ],
  },
  primaryColor: "gray",
  primaryShade: { light: 9, dark: 8 },
  defaultRadius: "md",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  headings: {
    fontWeight: "650",
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
