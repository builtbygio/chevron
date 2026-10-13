'use strict';

/**
 * `textDocument/implementation` and `textDocument/typeDefinition`.
 *
 * Both answer exactly as `textDocument/definition` does — `Location`,
 * `Location[]` or `LocationLink[]` — so they share its normalisation, utf-8
 * conversion included. Only the method and the capability differ.
 */

const { pathToUri } = require('../path-uri');
const {
  normalizeDefinitionResultForEncoding,
  positionFor
} = require('./definitions');

/** Each navigation request, by the name the client uses for it. */
export const NAVIGATION = {
  implementation: {
    method: 'textDocument/implementation',
    capability: 'implementationProvider'
  },
  typeDefinition: {
    method: 'textDocument/typeDefinition',
    capability: 'typeDefinitionProvider'
  }
};

interface ClientLike {
  request: Function;
  getServerIdForEditor: Function;
  getPositionEncoding?: (serverId: string) => string;
}

/**
 * Whether a server's capabilities include `name`. A provider capability is
 * `boolean | Options | RegistrationOptions`: anything but absent or `false`
 * means yes.
 */
export function servesCapability(session: any, name: string): boolean {
  if (!session || !session.capabilities) return false;
  const provider = session.capabilities[name];
  return provider === true || (typeof provider === 'object' && provider !== null);
}

/**
 * Locations for `kind` ('implementation' | 'typeDefinition') at `point`, or
 * the cursor. [] when there is no server or it fails.
 */
export async function locationsAt(
  client: ClientLike,
  kind: string,
  editor: any,
  point?: { row: number; column: number } | null
): Promise<any[]> {
  const navigation = NAVIGATION[kind];
  if (!navigation) throw new Error(`Unknown navigation request: ${kind}`);

  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return [];

  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return [];
  const uri = pathToUri(filePath);
  if (!uri) return [];

  const pos = point || (editor.getCursorBufferPosition && editor.getCursorBufferPosition());
  if (!pos) return [];

  const { result, error } = await client.request(
    serverId,
    navigation.method,
    {
      textDocument: { uri },
      position: positionFor(client, editor, serverId, pos)
    },
    15000
  );
  if (error) return [];

  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  return normalizeDefinitionResultForEncoding(result, encoding);
}

module.exports = { NAVIGATION, servesCapability, locationsAt };
