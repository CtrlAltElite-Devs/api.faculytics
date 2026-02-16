import { Injectable } from '@nestjs/common';
import { NonStreamingResult, StreamingResult } from 'chatkit-node-backend-sdk';
import { ChatKitServerImpl } from './lib/chatkit.server';
import { ChatKitStore } from './lib/chatkit.store';
import { ChatKitContext } from './lib/chatkit.types';

@Injectable()
export class ChatKitService {
  private readonly server: ChatKitServerImpl;

  constructor(private readonly store: ChatKitStore) {
    this.server = new ChatKitServerImpl(store);
  }

  async process(
    requestJson: string,
    context: ChatKitContext,
  ): Promise<StreamingResult | NonStreamingResult> {
    return this.server.process(requestJson, context);
  }
}
