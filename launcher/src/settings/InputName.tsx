import { useTextInput } from '../shared/hooks/useTextInput';
import type { SettingsActions } from './types';

interface Props { port: string; name?: string; placeholder?: string; actions: SettingsActions }

export const InputName = ({ port, name, placeholder, actions }: Props) => {
  const { focus, ...input } = useTextInput(name || '', value => actions.saveInputName(port, value));
  return (
    <div class="pill unit name-pill" data-key={'name:' + port} onClick={focus}>
      <span class="port">{port}</span>
      <input {...input} type="text" maxLength={24} placeholder={placeholder || 'Add a name'} aria-label={port + ' name'} />
    </div>
  );
};
