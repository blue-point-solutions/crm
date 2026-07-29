/**
 * @expo/vector-icons transitively requires expo-asset (via expo-font), which
 * is not installed in this app. Stub the icon set — these are render smoke
 * tests, not icon tests.
 */
jest.mock("@expo/vector-icons", () => {
  const ReactLib = require("react");
  const MockIcon = (props: Record<string, unknown>) =>
    ReactLib.createElement("Ionicons", props);
  MockIcon.glyphMap = {};
  return { Ionicons: MockIcon };
});

import React from "react";
import renderer, { act, ReactTestRenderer } from "react-test-renderer";
import AppButton from "../AppButton";
import AppTextInput from "../AppTextInput";
import Badge from "../Badge";
import EmptyState from "../EmptyState";
import {
  avatarColor,
  completenessColor,
  temperatureColor,
  colors,
} from "../../theme";

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

function textContent(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType("Text" as any, { deep: true })
    .map((n) => n.children.join(""))
    .join(" ");
}

describe("AppButton", () => {
  const noop = () => {};

  it.each(["primary", "secondary", "ghost", "danger"] as const)(
    "renders %s variant with title",
    (variant) => {
      const tree = render(
        <AppButton title="Press Me" onPress={noop} variant={variant} />
      );
      expect(tree.toJSON()).toBeTruthy();
      expect(textContent(tree)).toContain("Press Me");
    }
  );

  it("sets accessibility label from title and disabled state", () => {
    const tree = render(<AppButton title="Save" onPress={noop} disabled />);
    const btn = tree.root.findByProps({ accessibilityRole: "button" });
    expect(btn.props.accessibilityLabel).toBe("Save");
    expect(btn.props.accessibilityState.disabled).toBe(true);
  });

  it("shows an ActivityIndicator instead of the title when loading", () => {
    const tree = render(<AppButton title="Save" onPress={noop} loading />);
    expect(
      tree.root.findAllByType("ActivityIndicator" as any).length
    ).toBeGreaterThan(0);
    expect(textContent(tree)).not.toContain("Save");
  });
});

describe("AppTextInput", () => {
  it("renders label and error text", () => {
    const tree = render(
      <AppTextInput label="Email" value="" error="Email is required" />
    );
    const text = textContent(tree);
    expect(text).toContain("Email");
    expect(text).toContain("Email is required");
  });

  it("omits error text when no error prop is set", () => {
    const tree = render(<AppTextInput label="Email" value="" />);
    expect(textContent(tree)).not.toContain("required");
  });

  it("derives accessibilityLabel from label", () => {
    const tree = render(<AppTextInput label="Password" value="" />);
    const input = tree.root.findByType("TextInput" as any);
    expect(input.props.accessibilityLabel).toBe("Password");
  });
});

describe("Badge", () => {
  it("renders the label for each variant", () => {
    for (const variant of ["default", "hot", "warm", "cold", "success"] as const) {
      const tree = render(<Badge label="Hot Lead" variant={variant} />);
      expect(textContent(tree)).toContain("Hot Lead");
    }
  });
});

describe("EmptyState", () => {
  it("renders title, message and action", () => {
    const tree = render(
      <EmptyState
        title="No contacts"
        message="Scan a card to get started"
        actionLabel="Scan Card"
        onAction={() => {}}
      />
    );
    const text = textContent(tree);
    expect(text).toContain("No contacts");
    expect(text).toContain("Scan a card to get started");
    expect(text).toContain("Scan Card");
  });

  it("omits the action button without actionLabel", () => {
    const tree = render(<EmptyState title="Nothing here" />);
    expect(
      tree.root.findAllByProps({ accessibilityRole: "button" }).length
    ).toBe(0);
  });
});

describe("theme helpers", () => {
  it("avatarColor is deterministic per name", () => {
    expect(avatarColor("Sarah Mitchell")).toBe(avatarColor("Sarah Mitchell"));
    expect(avatarColor("James O'Brien")).toBe(avatarColor("James O'Brien"));
    expect(avatarColor("Priya Sharma")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("temperatureColor maps Hot/Warm/Cold and falls back to neutral", () => {
    expect(temperatureColor("Hot")).toBe(colors.hot);
    expect(temperatureColor("Warm")).toBe(colors.warm);
    expect(temperatureColor("Cold")).toBe(colors.cold);
    expect(temperatureColor(undefined)).toBe(colors.neutral);
  });

  it("completenessColor honors the 80/50 thresholds", () => {
    expect(completenessColor(100)).toBe(colors.success);
    expect(completenessColor(80)).toBe(colors.success);
    expect(completenessColor(79)).toBe(colors.warning);
    expect(completenessColor(50)).toBe(colors.warning);
    expect(completenessColor(49)).toBe(colors.hot);
    expect(completenessColor(0)).toBe(colors.hot);
  });
});
