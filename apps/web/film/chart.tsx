import { Bar as AppBar, type BarProps } from "../src/components/charts/bar";
// Use the app chart's own settled geometry instead of its wall-clock entrance spring.
export function Bar(props: BarProps) {
  return <AppBar {...props} animate={false} />;
}
Bar.displayName = "Bar";
