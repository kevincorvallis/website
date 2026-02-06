interface SpacerProps {
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-12",
  md: "h-24",
  lg: "h-40",
};

export function Spacer({ size = "md" }: SpacerProps) {
  return <div className={sizeMap[size]} />;
}
