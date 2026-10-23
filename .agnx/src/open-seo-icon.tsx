// 场景：OpenSEO 侧栏/命令图标 — 使用 Lucide Search（manifest.icon 另指 public/favicon.png）。
import { Search } from "lucide-react-native";

export function OpenSeoIcon(props: {
  size?: number | string;
  color?: string;
  absoluteStrokeWidth?: boolean;
}) {
  return <Search {...props} />;
}
