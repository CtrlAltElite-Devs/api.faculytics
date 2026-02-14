import { Agent, run } from '@openai/agents';
import {
  agents,
  ChatKitServer,
  ThreadMetadata,
  ThreadStreamEvent,
  UserMessageItem,
} from 'chatkit-node-backend-sdk';
import { Store } from 'chatkit-node-backend-sdk';
import { ChatKitContext } from './chatkit.types';

export class ChatKitServerImpl extends ChatKitServer<ChatKitContext> {
  private readonly agent: Agent;
  constructor(store: Store<ChatKitContext>) {
    super(store);

    this.agent = new Agent({
      model: 'gpt-5',
      name: 'Assistant',
      instructions: 'You are a helpful AI assistant',
    });
  }

  async *respond(
    thread: ThreadMetadata,
    inputUserMessage: UserMessageItem | null,
    context: ChatKitContext,
  ): AsyncGenerator<ThreadStreamEvent> {
    if (!inputUserMessage) return;

    const agentContext = agents.createAgentContext(thread, this.store, context);

    const agentInput = await agents.simpleToAgentInput(inputUserMessage);

    const runnerStream = (await run(this.agent, agentInput, {
      stream: true,
      context: agentContext,
    })) as AsyncIterable<any>;

    // Stream events to the client
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- SDK type mismatch between bundled agents versions
    for await (const event of agents.streamAgentResponse(
      agentContext,
      runnerStream,
    )) {
      yield event;
    }

    // Auto-generate thread title
    if (!thread.title) {
      thread.title = this.generateTitle(inputUserMessage);
    }
  }

  generateTitle(message: UserMessageItem) {
    const text = message.content
      .filter((content) => content.type === 'input_text')
      .map((content) => content.text)
      .join(' ');
    return text.slice(0, 50) + (text.length > 50 ? '...' : '');
  }
}
