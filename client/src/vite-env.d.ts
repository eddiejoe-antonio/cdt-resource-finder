/// <reference types="vite/client" />
import type { DetailedHTMLProps, HTMLAttributes, ReactElement } from "react";

declare global {
  namespace JSX {
    // ✅ Provide JSX.Element without empty-interface or any
    type Element = ReactElement;

    interface IntrinsicElements {
      "cagov-pagination": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        "data-current-page"?: string | number;
        "data-total-pages"?: string | number;
        "data-previous"?: string;
        "data-next"?: string;
      };

      "ca-gov-icon-tool": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "ca-gov-icon-location": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "ca-gov-icon-globe": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export {};
