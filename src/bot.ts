import "dotenv/config";
import { Telegraf } from "telegraf";
import { KEYBOARDS } from "./repositories/ru.keyboards";
import { MESSAGES } from "./repositories/ru.messages";
import {
    addChannel,
    addMember,
    createAdmin,
    createGift,
    deleteChannel,
    findAllChannels,
    findAllGifts,
    findeOneGift,
    getEndPooling,
    getStartPooling,
    updateGift,
} from "./services/api.services";
import Redis from "ioredis";
import { fromZonedTime } from "date-fns-tz";
import { parse } from "date-fns";
import cron from "node-cron";
import { MessageEntity } from "telegraf/typings/core/types/typegram";
import XLSX from "xlsx";
import path from "path";

const bot = new Telegraf(process.env.BOT_TOKEN || "");
const redis = new Redis(process.env.REDIS || "");

bot.launch();

const addChannelState = new Map<number, "WAIT_CHANNEL">();
const addGiftState = new Map<
    number,
    | "WAIT_START_POST"
    | "WAIT_START_POST_DATE"
    | "WAIT_START_POST_CHANNELS"
    | "WAIT_END_POST"
    | "WAIT_END_POST_DATE"
>();
const addGiftEndPostId = new Map<number, string>();

const handledAlbums = new Set<string>();

bot.command("start", async (ctx) => {
    await createAdmin(String(ctx.from.id), {
        username: ctx.from.username,
    });
});

// Channels

bot.command("channel", async (ctx) => {
    const channels = await findAllChannels(String(ctx.from.id));

    await ctx.reply(MESSAGES.allChannels, {
        parse_mode: "Markdown",
        ...KEYBOARDS.allChannels(channels),
    });
});

bot.action("add_channel", async (ctx) => {
    addChannelState.set(ctx.from.id, "WAIT_CHANNEL");

    await ctx.editMessageText(MESSAGES.addChannel, { parse_mode: "Markdown" });
    ctx.answerCbQuery();
});

bot.action(/delete_channel_(.*)/, async (ctx) => {
    await deleteChannel(String(ctx.from.id), {
        id: ctx.match[1],
    });

    const channels = await findAllChannels(String(ctx.from.id));
    await ctx.editMessageText(MESSAGES.allChannels, {
        parse_mode: "Markdown",
        ...KEYBOARDS.allChannels(channels),
    });
    ctx.answerCbQuery();
});

// Gift

bot.command("gift", async (ctx) => {
    const gifts = await findAllGifts(String(ctx.from.id));

    await ctx.reply(MESSAGES.allGifts, {
        parse_mode: "Markdown",
        ...KEYBOARDS.allGifts(gifts),
    });
});

bot.action("add_gift", async (ctx) => {
    const channels = await findAllChannels(String(ctx.from.id));

    if (channels.length > 0) {
        addGiftState.set(ctx.from.id, "WAIT_START_POST");
        await redis.del(`${ctx.from.id}:start_post_media`);
        await redis.del(`${ctx.from.id}:start_post_content`);
        await redis.del(`${ctx.from.id}:start_post_content_entities`);
        await redis.del(`${ctx.from.id}:start_post_date`);
        await redis.del(`${ctx.from.id}:start_post_channels`);
        await redis.del(`${ctx.from.id}:start_post_media_type`);

        await ctx.editMessageText(MESSAGES.addGiftStartPost, {
            parse_mode: "Markdown",
        });
        ctx.answerCbQuery();
    } else {
        await ctx.editMessageText(MESSAGES.addGiftChannelsCountError, {
            parse_mode: "Markdown",
        });
        ctx.answerCbQuery();
    }
});

bot.action(/add_channel_to_gift_(.*)/, async (ctx) => {
    const channels = await findAllChannels(String(ctx.from.id));

    await redis.rpush(`${ctx.from.id}:start_post_channels`, ctx.match[1]);

    const selectedChannels = await redis.lrange(
        `${ctx.from.id}:start_post_channels`,
        0,
        -1
    );

    const filteredChannels = channels.filter(
        (channel) => !selectedChannels.includes(channel.id || "")
    );

    await ctx.editMessageText(MESSAGES.addGiftChannels, {
        parse_mode: "Markdown",
        ...KEYBOARDS.addGiftChannels(filteredChannels),
    });
    ctx.answerCbQuery();
});

bot.action("save_gift", async (ctx) => {
    const startPostMedia = await redis.get(`${ctx.from.id}:start_post_media`);
    const startPostContent = await redis.get(
        `${ctx.from.id}:start_post_content`
    );
    const startPostDate = await redis.get(`${ctx.from.id}:start_post_date`);
    const startPostContentEntities = await redis.get(
        `${ctx.from.id}:start_post_content_entities`
    );
    const startPostMediaType = await redis.get(
        `${ctx.from.id}:start_post_media_type`
    );
    const channels = await redis.lrange(
        `${ctx.from.id}:start_post_channels`,
        0,
        -1
    );

    await createGift(String(ctx.from.id), {
        startPostMedia: startPostMedia || null,
        startPostContent: startPostContent || "",
        startPostDate: startPostDate || "",
        startPostContentEntities: startPostContentEntities
            ? JSON.parse(startPostContentEntities)
            : [],
        startPostMediaType: startPostMediaType || null,
        channels: channels || [],
    });

    ctx.editMessageText(MESSAGES.addGiftFinal, { parse_mode: "Markdown" });
    ctx.answerCbQuery();
});

bot.action(/edit_gift_(.*)/, async (ctx) => {
    const gift = await findeOneGift(ctx.match[1]);

    ctx.editMessageText(`Управление конкурсом:`, {
        parse_mode: "Markdown",
        ...KEYBOARDS.editGift(gift),
    });

    ctx.answerCbQuery();
});

bot.action(/add_gift_end_post_(.*)/, async (ctx) => {
    addGiftState.set(ctx.from.id, "WAIT_END_POST");
    addGiftEndPostId.set(ctx.from.id, ctx.match[1]);
    await redis.del(`${ctx.from.id}:end_post_media`);
    await redis.del(`${ctx.from.id}:end_post_content`);
    await redis.del(`${ctx.from.id}:end_post_content_entities`);
    await redis.del(`${ctx.from.id}:end_post_date`);
    await redis.del(`${ctx.from.id}:end_post_channels`);
    await redis.del(`${ctx.from.id}:end_post_media_type`);

    await ctx.editMessageText(MESSAGES.addGiftEndPost, {
        parse_mode: "Markdown",
    });

    ctx.answerCbQuery();
});

bot.action(/add_member_(.*)/, async (ctx) => {
    const [channelname, giftId] = ctx.match[1].split(":");

    const member = await bot.telegram.getChatMember(channelname, ctx.from.id);

    if (member.status === "left") {
        return ctx.answerCbQuery("Подпишитесь на канал для участия", {
            show_alert: true,
        });
    }

    try {
        const avatars = await bot.telegram.getUserProfilePhotos(ctx.from.id);
        let avatarId = null;

        if (avatars.total_count > 0) {
            const avatar = avatars.photos[0];
            avatarId = avatar[avatar.length - 1].file_id;
        }

        await addMember(String(ctx.from.id), {
            username: ctx.from.username,
            giftId,
            picture: avatarId || null,
        });

        const gift = await findeOneGift(giftId);

        ctx.editMessageReplyMarkup(
            KEYBOARDS.addMember(channelname, gift).reply_markup
        );

        ctx.answerCbQuery("Вы зарегестрированы на участие в конкурсе", {
            show_alert: true,
        });
    } catch {
        ctx.answerCbQuery("Вы уже зарегестрированы на участие в конкурсе", {
            show_alert: true,
        });
    }
});

bot.action(/get_gift_xlsx_(.*)/, async (ctx) => {
    const gift = await findeOneGift(ctx.match[1]);
    const data =
        gift.members?.map((member) => [`https://t.me/${member.username}`]) ??
        [];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Участники");

    const filePath = path.join(process.cwd(), "Участники.csv");
    XLSX.writeFile(workbook, "Участники.csv", {
        bookType: "csv",
        type: "buffer",
    });

    await ctx.replyWithDocument({
        source: filePath,
        filename: "Участники.csv",
    });

    ctx.answerCbQuery();
});

// State

bot.on("text", async (ctx) => {
    if (addChannelState.get(ctx.from.id) === "WAIT_CHANNEL") {
        const channel = ctx.message.text.trim();

        if (!/^@[a-zA-Z0-9_]{5,}$/.test(channel)) {
            await ctx.reply(MESSAGES.addChannelFormatError, {
                parse_mode: "Markdown",
            });
            return;
        }

        try {
            const channelChat = await ctx.telegram.getChat(channel);
            const member = await ctx.telegram.getChatMember(
                channel,
                ctx.from.id
            );

            if (["administrator", "creator"].includes(member.status)) {
                await addChannel(String(ctx.from.id), {
                    id: String(channelChat.id),
                    channelname: channel,
                });

                const channels = await findAllChannels(String(ctx.from.id));
                await ctx.reply(MESSAGES.allChannels, {
                    parse_mode: "Markdown",
                    ...KEYBOARDS.allChannels(channels),
                });
                addChannelState.delete(ctx.from.id);
            } else {
                await ctx.reply(MESSAGES.addChannelUserRightsError, {
                    parse_mode: "Markdown",
                });
                addChannelState.delete(ctx.from.id);
            }
        } catch {
            await ctx.reply(MESSAGES.addChannelBotRightsError, {
                parse_mode: "Markdown",
            });
            addChannelState.delete(ctx.from.id);
        }
    }

    if (addGiftState.get(ctx.from.id) === "WAIT_START_POST") {
        if (ctx.message.text && ctx.message.text.trim()) {
            await redis.set(
                `${ctx.from.id}:start_post_content`,
                ctx.message.text
            );

            await redis.set(
                `${ctx.from.id}:start_post_content_entities`,
                JSON.stringify(ctx.message.entities)
            );

            addGiftState.set(ctx.from.id, "WAIT_START_POST_DATE");
            await ctx.reply(MESSAGES.addGiftStartPostDate, {
                parse_mode: "Markdown",
            });
        } else {
            await ctx.reply(MESSAGES.addGiftEmptyTextError, {
                parse_mode: "Markdown",
            });
        }
    }

    if (addGiftState.get(ctx.from.id) === "WAIT_START_POST_DATE") {
        if (
            ctx.message.text
                .trim()
                .match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/)
        ) {
            const parsedDate = parse(
                ctx.message.text,
                "dd.MM.yyyy HH:mm",
                new Date()
            );
            const utcDate = fromZonedTime(parsedDate, "Europe/Moscow");
            const iso = utcDate.toISOString();

            await redis.set(`${ctx.from.id}:start_post_date`, `${iso}`);

            addGiftState.set(ctx.from.id, "WAIT_START_POST_CHANNELS");

            const channels = await findAllChannels(String(ctx.from.id));

            await ctx.reply(MESSAGES.addGiftChannels, {
                parse_mode: "Markdown",
                ...KEYBOARDS.addGiftChannels(channels),
            });
        } else {
            ctx.reply(MESSAGES.addGiftStartPostDateFormatError);
        }
    }

    if (addGiftState.get(ctx.from.id) === "WAIT_END_POST") {
        if (ctx.message.text && ctx.message.text.trim()) {
            await redis.set(
                `${ctx.from.id}:end_post_content`,
                ctx.message.text
            );

            await redis.set(
                `${ctx.from.id}:end_post_content_entities`,
                JSON.stringify(ctx.message.entities)
            );

            addGiftState.set(ctx.from.id, "WAIT_END_POST_DATE");
            await ctx.reply(MESSAGES.addGiftStartPostDate, {
                parse_mode: "Markdown",
            });
        } else {
            await ctx.reply(MESSAGES.addGiftEmptyTextError, {
                parse_mode: "Markdown",
            });
        }
    }

    if (addGiftState.get(ctx.from.id) === "WAIT_END_POST_DATE") {
        if (
            ctx.message.text
                .trim()
                .match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/)
        ) {
            const parsedDate = parse(
                ctx.message.text,
                "dd.MM.yyyy HH:mm",
                new Date()
            );
            const utcDate = fromZonedTime(parsedDate, "Europe/Moscow");
            const iso = utcDate.toISOString();

            await redis.set(`${ctx.from.id}:end_post_date`, `${iso}`);

            const endPostMedia = await redis.get(
                `${ctx.from.id}:end_post_media`
            );
            const endPostContent = await redis.get(
                `${ctx.from.id}:end_post_content`
            );
            const endPostContentEntities = await redis.get(
                `${ctx.from.id}:end_post_content_entities`
            );
            const endPostMediaType = await redis.get(
                `${ctx.from.id}:end_post_media_type`
            );
            const endPostDate = await redis.get(`${ctx.from.id}:end_post_date`);

            await updateGift(String(addGiftEndPostId.get(ctx.from.id)), {
                endPostMedia: endPostMedia || null,
                endPostContent: endPostContent || "",
                endPostDate: endPostDate || "",
                endPostContentEntities: endPostContentEntities
                    ? JSON.parse(endPostContentEntities)
                    : [],
                endPostMediaType: endPostMediaType || null,
            });

            const gift = await findeOneGift(
                String(addGiftEndPostId.get(ctx.from.id))
            );

            gift.channels?.map(async (channel: any) => {
                await bot.telegram.editMessageReplyMarkup(
                    Number(channel.id),
                    Number(gift.startMessageId),
                    undefined,
                    undefined
                );
            });

            ctx.reply(MESSAGES.addGiftEndPostFinal, {
                parse_mode: "Markdown",
            });
        } else {
            ctx.reply(MESSAGES.addGiftStartPostDateFormatError);
        }
    }
});

bot.on("photo", async (ctx) => {
    if (addGiftState.get(ctx.from.id) === "WAIT_START_POST") {
        if (!ctx.message.media_group_id) {
            if (ctx.message.caption && ctx.message.caption.trim()) {
                await redis.set(
                    `${ctx.from.id}:start_post_media`,
                    ctx.message.photo[ctx.message.photo.length - 1].file_id
                );
                await redis.set(
                    `${ctx.from.id}:start_post_content`,
                    ctx.message.caption
                );
                await redis.set(
                    `${ctx.from.id}:start_post_content_entities`,
                    JSON.stringify(ctx.message.caption_entities)
                );
                await redis.set(
                    `${ctx.from.id}:start_post_media_type`,
                    "PHOTO"
                );

                addGiftState.set(ctx.from.id, "WAIT_START_POST_DATE");
                await ctx.reply(MESSAGES.addGiftStartPostDate, {
                    parse_mode: "Markdown",
                });
            } else {
                await ctx.reply(MESSAGES.addGiftEmptyTextError, {
                    parse_mode: "Markdown",
                });
            }
        } else {
            if (handledAlbums.has(ctx.message.media_group_id)) {
                return;
            }

            handledAlbums.add(ctx.message.media_group_id);
            await ctx.reply(MESSAGES.addGiftCountPhotoError, {
                parse_mode: "Markdown",
            });

            setTimeout(() => {
                handledAlbums.delete(ctx.message.media_group_id || "");
            }, 5000);
        }
    }

    if (addGiftState.get(ctx.from.id) === "WAIT_END_POST") {
        if (!ctx.message.media_group_id) {
            if (ctx.message.caption && ctx.message.caption.trim()) {
                await redis.set(
                    `${ctx.from.id}:end_post_media`,
                    ctx.message.photo[ctx.message.photo.length - 1].file_id
                );
                await redis.set(
                    `${ctx.from.id}:end_post_content`,
                    ctx.message.caption
                );
                await redis.set(
                    `${ctx.from.id}:end_post_content_entities`,
                    JSON.stringify(ctx.message.caption_entities)
                );
                await redis.set(`${ctx.from.id}:end_post_media_type`, "PHOTO");

                addGiftState.set(ctx.from.id, "WAIT_END_POST_DATE");
                await ctx.reply(MESSAGES.addGiftStartPostDate, {
                    parse_mode: "Markdown",
                });
            } else {
                await ctx.reply(MESSAGES.addGiftEmptyTextError, {
                    parse_mode: "Markdown",
                });
            }
        } else {
            if (handledAlbums.has(ctx.message.media_group_id)) {
                return;
            }

            handledAlbums.add(ctx.message.media_group_id);
            await ctx.reply(MESSAGES.addGiftCountPhotoError, {
                parse_mode: "Markdown",
            });

            setTimeout(() => {
                handledAlbums.delete(ctx.message.media_group_id || "");
            }, 5000);
        }
    }
});

bot.on("video", async (ctx) => {
    if (addGiftState.get(ctx.from.id) === "WAIT_START_POST") {
        if (!ctx.message.media_group_id) {
            if (ctx.message.caption && ctx.message.caption.trim()) {
                await redis.set(
                    `${ctx.from.id}:start_post_media`,
                    ctx.message.video.file_id
                );
                await redis.set(
                    `${ctx.from.id}:start_post_content`,
                    ctx.message.caption
                );
                await redis.set(
                    `${ctx.from.id}:start_post_content_entities`,
                    JSON.stringify(ctx.message.caption_entities)
                );
                await redis.set(
                    `${ctx.from.id}:start_post_media_type`,
                    "VIDEO"
                );

                addGiftState.set(ctx.from.id, "WAIT_START_POST_DATE");
                await ctx.reply(MESSAGES.addGiftStartPostDate, {
                    parse_mode: "Markdown",
                });
            } else {
                await ctx.reply(MESSAGES.addGiftEmptyTextError, {
                    parse_mode: "Markdown",
                });
            }
        } else {
            if (handledAlbums.has(ctx.message.media_group_id)) {
                return;
            }

            handledAlbums.add(ctx.message.media_group_id);
            await ctx.reply(MESSAGES.addGiftCountPhotoError, {
                parse_mode: "Markdown",
            });

            setTimeout(() => {
                handledAlbums.delete(ctx.message.media_group_id || "");
            }, 5000);
        }
    }

    if (addGiftState.get(ctx.from.id) === "WAIT_END_POST") {
        if (!ctx.message.media_group_id) {
            if (ctx.message.caption && ctx.message.caption.trim()) {
                await redis.set(
                    `${ctx.from.id}:end_post_media`,
                    ctx.message.video.file_id
                );
                await redis.set(
                    `${ctx.from.id}:end_post_content`,
                    ctx.message.caption
                );
                await redis.set(
                    `${ctx.from.id}:ent_post_content_entities`,
                    JSON.stringify(ctx.message.caption_entities)
                );
                await redis.set(
                    `${ctx.from.id}:end_post_content_entities`,
                    JSON.stringify(ctx.message.caption_entities)
                );
                await redis.set(`${ctx.from.id}:end_post_media_type`, "VIDEO");

                addGiftState.set(ctx.from.id, "WAIT_END_POST_DATE");
                await ctx.reply(MESSAGES.addGiftStartPostDate, {
                    parse_mode: "Markdown",
                });
            } else {
                await ctx.reply(MESSAGES.addGiftEmptyTextError, {
                    parse_mode: "Markdown",
                });
            }
        } else {
            if (handledAlbums.has(ctx.message.media_group_id)) {
                return;
            }

            handledAlbums.add(ctx.message.media_group_id);
            await ctx.reply(MESSAGES.addGiftCountPhotoError, {
                parse_mode: "Markdown",
            });

            setTimeout(() => {
                handledAlbums.delete(ctx.message.media_group_id || "");
            }, 5000);
        }
    }
});

bot.action("noop", async (ctx) => {
    ctx.answerCbQuery();
});

cron.schedule("* * * * *", async () => {
    const gifts = await getStartPooling();

    gifts.map(async (gift) => {
        gift.channels?.map(async (channel: any) => {
            if (gift.startPostMedia) {
                if (gift.startPostMediaType === "PHOTO") {
                    const message = await bot.telegram.sendPhoto(
                        channel.channelname,
                        gift.startPostMedia,
                        {
                            caption: gift.startPostContent,
                            caption_entities:
                                gift.startPostContentEntities as unknown as MessageEntity[],
                            ...KEYBOARDS.addMember(channel.channelname, gift),
                        }
                    );

                    await updateGift(String(gift.id), {
                        startMessageId: String(message.message_id),
                    });
                } else if (gift.startPostMediaType === "VIDEO") {
                    const message = await bot.telegram.sendVideo(
                        channel.channelname,
                        gift.startPostMedia,
                        {
                            caption: gift.startPostContent,
                            caption_entities:
                                gift.startPostContentEntities as unknown as MessageEntity[],
                            ...KEYBOARDS.addMember(channel.channelname, gift),
                        }
                    );

                    await updateGift(String(gift.id), {
                        startMessageId: String(message.message_id),
                    });
                }
            } else {
                const message = await bot.telegram.sendMessage(
                    channel.channelname,
                    gift.startPostContent || "",
                    {
                        entities:
                            gift.startPostContentEntities as unknown as MessageEntity[],
                        ...KEYBOARDS.addMember(channel.channelname, gift),
                    }
                );

                await updateGift(String(gift.id), {
                    startMessageId: String(message.message_id),
                });
            }
        });

        await updateGift(gift.id || "", { startPostStatus: "PUBLISH" });
    });
});

cron.schedule("* * * * *", async () => {
    const gifts = await getEndPooling();

    gifts.map(async (gift) => {
        gift.channels?.map(async (channel: any) => {
            if (gift.endPostMedia) {
                if (gift.endPostMediaType === "PHOTO") {
                    await bot.telegram.sendPhoto(
                        channel.channelname,
                        gift.endPostMedia,
                        {
                            caption: gift.endPostContent,
                            caption_entities:
                                gift.endPostContentEntities as unknown as MessageEntity[],
                        }
                    );
                } else if (gift.startPostMediaType === "VIDEO") {
                    await bot.telegram.sendVideo(
                        channel.channelname,
                        gift.endPostMedia,
                        {
                            caption: gift.endPostContent,
                            caption_entities:
                                gift.endPostContentEntities as unknown as MessageEntity[],
                        }
                    );
                }
            } else {
                await bot.telegram.sendMessage(
                    channel.channelname,
                    gift.endPostContent || "",
                    {
                        entities:
                            gift.endPostContentEntities as unknown as MessageEntity[],
                    }
                );
            }
        });

        await updateGift(gift.id || "", {
            endPostStatus: "PUBLISH",
            status: "COMPLETED",
        });
    });
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
