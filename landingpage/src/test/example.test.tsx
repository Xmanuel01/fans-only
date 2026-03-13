import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";

describe("landing app routes", () => {
  it("renders critical navigation links for production paths", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "SpicyX" })).toHaveAttribute("href", "/app/");
    expect(screen.getAllByRole("link", { name: /explore creators/i })[0]).toHaveAttribute(
      "href",
      "/user/"
    );
    expect(screen.getAllByRole("link", { name: /become a creator/i })[0]).toHaveAttribute(
      "href",
      "/creator/"
    );
  });

  it("sets accessible state on mobile menu toggle", () => {
    render(<App />);

    const toggleButton = screen.getByRole("button", { name: /open navigation menu/i });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(toggleButton).toHaveAttribute("aria-controls", "mobile-navigation");
  });
});
