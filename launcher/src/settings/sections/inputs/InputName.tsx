import { RemoteControl } from '../../components/RemoteControl';
import { useTextInput } from '../../../shared/hooks/useTextInput';
import type { SettingsActions } from '../../types';

interface Props { port: string; name?: string; placeholder?: string; actions: SettingsActions }

export const InputName = ({ port, name, placeholder, actions }: Props) => {
  const { focus, ...input } = useTextInput(name || '', value => actions.saveInputName(port, value));
  return (
    <RemoteControl class="pill unit name-pill" focusKey={'name:' + port} onClick={focus}>
      <span class="port">{port}</span>
      <input {...input} type="text" maxLength={24} placeholder={placeholder || 'Add a name'} aria-label={port + ' name'} />
    </RemoteControl>
  );
};
