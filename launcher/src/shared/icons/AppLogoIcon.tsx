interface Props {
  path: string;
  colour: string;
}

export const AppLogoIcon = ({ path, colour }: Props) => (
  <svg class="logo" viewBox="0 0 24 24" aria-hidden="true">
    <path d={path} fill={colour} />
  </svg>
);
