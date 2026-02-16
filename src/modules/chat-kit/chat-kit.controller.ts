import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UseJwtGuard } from '../../security/decorators';
import { ChatKitService } from './chat-kit.service';

type JwtUser = {
  userId: string;
  moodleUserId?: number;
};

type JwtRequest = Request & { user: JwtUser };

@Controller('chatkit')
export class ChatKitController {
  constructor(private readonly chatKitService: ChatKitService) {}

  @UseJwtGuard()
  @Post()
  async Handle(
    @Body() body: unknown,
    @Req() req: JwtRequest,
    @Res() res: Response,
  ) {
    const context = {
      userId: req.user.userId,
      moodleUserId: req.user.moodleUserId,
    };

    const result = await this.chatKitService.process(
      JSON.stringify(body ?? {}),
      context,
    );

    if (result.isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      for await (const chunk of result) {
        res.write(chunk);
      }

      res.end();
      return;
    }

    res.json(result.toJSON());
  }
}
