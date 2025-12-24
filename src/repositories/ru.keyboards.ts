import { Markup } from "telegraf";
import { IChannel, IGift, IMember } from "../types/api.types";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

class Keyboards {
    allChannels(channels: IChannel[]) {
        return Markup.inlineKeyboard([
            ...channels.map((channel) => [
                Markup.button.callback(channel.channelname || "", `noop`),
                Markup.button.callback(
                    "Удалить",
                    `delete_channel_${channel.id}`
                ),
            ]),
            [Markup.button.callback("Добавить канал", "add_channel")],
        ]);
    }

    allGifts(gifts: IGift[]) {
        return Markup.inlineKeyboard([
            ...gifts.map((gift) => [
                Markup.button.callback(
                    `Конкурс от ${format(
                        toZonedTime(
                            new Date(String(gift.startPostDate)),
                            "Europe/Moscow"
                        ),
                        "dd.MM.yy HH:mm"
                    )} (${gift.status == "ACTIVE" ? "Активный" : "Завершен"})`,
                    `edit_gift_${gift.id}`
                ),
            ]),
            [Markup.button.callback("Добавить конкурс", "add_gift")],
        ]);
    }

    addGiftChannels(channels: IChannel[]) {
        return Markup.inlineKeyboard([
            ...channels.map((channel) => [
                Markup.button.callback(
                    channel.channelname || "",
                    `add_channel_to_gift_${channel.id}`
                ),
            ]),
            [Markup.button.callback("Завершить создание", "save_gift")],
        ]);
    }

    editGift(gift: IGift) {
        const keyboard = [
            [
                Markup.button.callback(
                    "Список участиников в формате .csv",
                    `get_gift_xlsx_${gift.id}`
                ),
            ],
            // [
            //     Markup.button.webApp(
            //         "Таблица участников",
            //         `https://egomiagiftbot.tw1.ru/${gift.id}`
            //     ),
            // ],
        ];

        if (!gift.endPostContent) {
            keyboard.push([
                Markup.button.callback(
                    "Завершить конкурс",
                    `add_gift_end_post_${gift.id}`
                ),
            ]);
        }

        return Markup.inlineKeyboard(keyboard);
    }

    addMember(channelname: string, gift: IGift) {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    `Участвовать (${gift.members?.length || 0})`,
                    `add_member_${channelname}:${gift.id}`
                ),
            ],
        ]);
    }
}

export const KEYBOARDS = new Keyboards();
