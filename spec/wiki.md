# Web3, Cryptography & Decentralized Storage Wiki (Глоссарий Daskibo DRM)

Данный справочный документ (Wiki / Glossary) содержит детальные описания всех криптографических примитивов, блокчейн-протоколов, сетевых аббревиатур и стандартов, упомянутых в архитектурных спецификациях и OSINT-анализе проекта Daskibo DRM. Каждый термин снабжен датой создания (основания) сущности и ссылками на официальные источники.

Используйте сквозные якоря (anchors) для быстрой навигации из других документов проекта.

---

## Алфавитный указатель (Index)

*   [ACC (Access Control Conditions)](#acc)
*   [ANS (Arweave Name System)](#ans)
*   [Arweave](#arweave)
*   [BLS12-381](#bls12-381)
*   [BNB Greenfield](#greenfield)
*   [Calypso (EPFL)](#calypso)
*   [DARC (Decentralized Access Rights Control)](#darc)
*   [DKG (Distributed Key Generation)](#dkg)
*   [DRM (Digital Rights Management)](#drm)
*   [ECDH (Elliptic-Curve Diffie-Hellman)](#ecdh)
*   [ENS (Ethereum Name Service)](#ens)
*   [Filecoin](#filecoin)
*   [GOSH (Git On-Chain)](#gosh)
*   [Handshake (HNS)](#handshake)
*   [IPFS](#ipfs)
*   [LITKEY (Lit Protocol)](#litkey)
*   [Medusa Protocol](#medusa)
*   [MEM (Molecular Execution Machine)](#mem)
*   [MPC (Multi-Party Computation)](#mpc)
*   [PoSt (Proof of Spacetime)](#post)
*   [PoRep (Proof of Replication)](#porep)
*   [PRE (Proxy Re-Encryption)](#pre)
*   [SBT (Soulbound Token)](#sbt)
*   [SPoRA (Succinct Proof of Random Access)](#spora)
*   [TACo (Threshold Access Control)](#taco)
*   [TEE (Trusted Execution Environment)](#tee)
*   [TSS (Threshold Secret Sharing)](#tss)
*   [Umbral Protocol](#umbral)

---

<a name="acc"></a>

### ACC (Access Control Conditions)
*   **Описание**: Условия контроля доступа. Набор логических правил и смарт-контрактных проверок, задаваемый создателем зашифрованного контента (например, владение конкретным NFT, определенный баланс токенов или возвращаемое значение пользовательского смарт-контракта), которые должны быть выполнены для получения дешифрующего ключа от распределенной TEE-сети Lit Protocol.
*   **Дата появления**: 2021 год.
*   **Источники**: [Lit Protocol Developer Docs](https://developer.litprotocol.com/)

<a name="ans"></a>

### ANS (Arweave Name System)
*   **Описание**: Децентрализованная система именования для сети Arweave, сопоставляющая человекочитаемые доменные имена (алиасы с расширением `.ar` или `.arweave`) со статическими идентификаторами транзакций (TxID) или адресами кошельков, обеспечивая бесшовный Web3 UX.
*   **Дата запуска**: 2022 год.
*   **Источники**: [Arweave Name System by DecentLand](https://decent.land/) | [ar.io Network](https://ar.io/)

<a name="arweave"></a>

### Arweave
*   **Описание**: Децентрализованная, устойчивая к цензуре сеть постоянного хранения данных (perpetual storage), построенная на структуре "Blockweave" и экономической модели единовременного платежа в эндаумент-фонд хранения, гарантирующая сохранность загруженной информации на срок более 200 лет.
*   **Дата запуска**: 2017 год (первоначальный запуск под именем Archain), запуск Mainnet — июнь 2018 г.
*   **Источники**: [Arweave Official Site](https://www.arweave.org/) | [Arweave Yellow Paper](https://www.arweave.org/yellow-paper.pdf)

<a name="bls12-381"></a>

### BLS12-381
*   **Описание**: Паринго-дружественная (pairing-friendly) эллиптическая кривая, разработанная Шоном Боуэном (Sean Bowe) в 2017 году, оптимизированная для использования в схемах построения пороговых подписей, распределенной генерации ключей (DKG) и zk-SNARKs.
*   **Дата создания**: 2017 год.
*   **Источники**: [IETF Internet-Draft BLS12-381](https://datatracker.ietf.org/doc/draft-irtf-cfrg-bls-signature/)

<a name="greenfield"></a>

### BNB Greenfield
*   **Описание**: Мультипротокольная блокчейн-система децентрализованного хранения данных и экономики данных в экосистеме BNB Chain. Объединяет высокоскоростные хранилища Storage Providers (SP) с нативной кросс-чейн совместимостью с BNB Smart Chain (BSC), позволяя управлять правами на файлы непосредственно через Solidity-смарт-контракты.
*   **Дата анонса**: Февраль 2023 г., запуск Mainnet — Октябрь 2023 г.
*   **Источники**: [BNB Greenfield Whitepaper](https://github.com/bnb-chain/greenfield-whitepaper) | [BNB Chain Docs](https://docs.bnbchain.org/greenfield-docs/)

<a name="calypso"></a>

### Calypso (EPFL)
*   **Описание**: Академический фреймворк для безопасного управления правами доступа и аудируемого хранения конфиденциальных данных поверх прозрачных публичных блокчейнов, использующий пороговое шифрование Threshold ElGamal и коллективные подписи (Cothority).
*   **Дата публикации**: 2018 год.
*   **Источники**: [CALYPSO: Auditable Sharing of Private Data over Blockchains (EPFL DEDIS)](https://www.epfl.ch/labs/dedis/)

<a name="darc"></a>

### DARC (Decentralized Access Rights Control)
*   **Описание**: Концепция децентрализованного контроля прав доступа, используемая во фреймворке Calypso. Представляет собой смарт-контракты, кодирующие сложные логические выражения прав пользователей (мультиподписи, роли, временные окна) для санкционирования пороговой дешифрации.
*   **Дата создания**: 2018 год.
*   **Источники**: [DARC Spec - DEDIS Lab EPFL](https://github.com/dedis/cothority)

<a name="dkg"></a>

### DKG (Distributed Key Generation)
*   **Описание**: Криптографический протокол распределенной генерации ключей, позволяющий группе независимых узлов совместно сгенерировать открытый и закрытый ключ ($t$-of-$n$) таким образом, чтобы ни один участник никогда не владел полным приватным ключом единолично.
*   **Дата создания**: Базовые математические принципы сформулированы Торбеном Педерсеном (Torben Pedersen) в 1991 году, современные Web3-адаптации появились в 2018–2020 гг.
*   **Источники**: [Pedersen DKG Paper (1991)](https://link.springer.com/chapter/10.1007/3-540-46416-6_22)

<a name="drm"></a>

### DRM (Digital Rights Management)
*   **Описание**: Технические средства защиты авторских прав и ограничения несанкционированного доступа, копирования или распространения цифрового контента. В Web3 реализуется посредством шифрования цифровых конвертов (AES) и децентрализованного гейтинга ключей (Lit/Threshold).
*   **Дата создания**: Термин вошел в практику в середине 1990-х годов с принятием DMCA (1998 г.) и развитием систем CSS (DVD-шифрование).
*   **Источники**: [W3C Encrypted Media Extensions (DRM Web Standard)](https://www.w3.org/TR/encrypted-media/)

<a name="ecdh"></a>

### ECDH (Elliptic-Curve Diffie-Hellman)
*   **Описание**: Протокол Диффи — Хеллмана на эллиптических кривых. Асимметричный криптографический протокол, позволяющий двум сторонам с известными парами открытых и закрытых ключей эллиптических кривых создать общий безопасный сессионный секретный ключ в незащищенном канале связи.
*   **Дата стандартизации**: Начало 2000-х (ANSI X9.63, IEEE 1363).
*   **Источники**: [NIST Recommendation for Pair-Wise Key-Establishment](https://csrc.nist.gov/publications/detail/sp/800-56a/rev-3/final)

<a name="ens"></a>

### ENS (Ethereum Name Service)
*   **Описание**: Распределенная, открытая и расширяемая система доменных имен, построенная на базе смарт-контрактов Ethereum. Связывает человекочитаемые домены `.eth` со статическими адресами кошельков, хэшами контента IPFS (ContentHash) или Arweave.
*   **Дата запуска**: 4 мая 2017 г. (Ethereum Foundation, создатель — Ник Джонсон).
*   **Источники**: [ENS Official Documentation](https://docs.ens.domains/)

<a name="filecoin"></a>

### Filecoin
*   **Описание**: Децентрализованная сеть хранения данных и двусторонний рынок аренды дискового пространства, выступающая в качестве экономического стимулятора поверх протокола IPFS. Надежность хранения гарантируется набором периодических доказательств (Proofs) и залогом (collateral) провайдеров.
*   **Дата запуска**: Whitepaper опубликован в 2017 г., запуск Mainnet — Октябрь 2020 г.
*   **Источники**: [Filecoin Spec](https://spec.filecoin.io/) | [Protocol Labs](https://protocol.ai/)

<a name="gosh"></a>

### GOSH (Git On-Chain)
*   **Описание**: Высокопроизводительный блокчейн первого уровня (Layer-1), разработанный для хранения репозиториев Git и файлов кода непосредственно в виде ончейн-смарт-контрактов. Нацелен на радикальное повышение безопасности цепочки поставок кода (Supply Chain Security) через децентрализованный CI/CD и консенсус сборок Docker.
*   **Дата запуска**: 10 мая 2022 года.
*   **Источники**: [GOSH Official Site](https://gosh.sh/) | [GOSH Git Remote Helper Docs](https://gosh.sh/docs)

<a name="handshake"></a>

### Handshake (HNS)
*   **Описание**: Децентрализованный, не требующий разрешений одноранговый протокол доменных имен, заменяющий централизованную корневую зону ICANN. Позволяет любому пользователю регистрировать собственные Top-Level Domains (TLD) на Handshake-блокчейне с помощью аукциона Vickrey.
*   **Дата запуска**: Запуск Mainnet — 3 февраля 2020 г.
*   **Источники**: [Handshake Developer Portal](https://handshake.org/) | [HNS Blockchain Specs](https://hns.to/)

<a name="ipfs"></a>

### IPFS (InterPlanetary File System)
*   **Описание**: Одноранговая гипермедийная распределенная сетевая файловая система, адресующая файлы по их уникальному криптографическому хэшу (CID — Content Identifier) вместо указания их физического местоположения в URL.
*   **Дата релиза**: Февраль 2015 г. (Хуан Бенет, Protocol Labs).
*   **Источники**: [IPFS Specs & Documentation](https://specs.ipfs.tech/)

<a name="litkey"></a>

### LITKEY (Lit Protocol)
*   **Описание**: Протокол управления ключами шифрования, децентрализованных подписей и TEE-вычислений (Lit Actions). Токен **LITKEY** (utility и governance токен сети) выступает в качестве платежного средства (gas) для выполнения операций порогового шифрования/дешифрования и стейкинга узлов.
*   **Дата основания**: 2021 год.
*   **Источники**: [Lit Protocol Portal](https://litprotocol.com/)

<a name="medusa"></a>

### Medusa Protocol
*   **Описание**: Децентрализованный оракул порогового шифрования и контроля доступа, созданный исследовательской группой CryptoNet Lab (Protocol Labs). Позволяет on-chain смарт-контрактам EVM выступать гейткиперами доступа к закрытым оффчейн-данным.
*   **Дата анонса**: 2021–2022 гг.
*   **Источники**: [CryptoNet Lab - Medusa](https://cryptonet.org/)

<a name="mem"></a>

### MEM (Molecular Execution Machine)
*   **Описание**: Децентрализованная, бессерверная мультичейн-песочница выполнения JavaScript смарт-контрактов, построенная поверх Arweave. Выступает в качестве оракула/вычислителя, связывающего on-chain состояния различных блокчейнов (EVM, SVM, Cosmos) с Arweave-сейфами.
*   **Дата запуска**: 2023 год (DecentLand Labs).
*   **Источники**: [MEM Dev Docs](https://mem.tech/)

<a name="mpc"></a>

### MPC (Multi-Party Computation)
*   **Описание**: Субдисциплина криптографии, изучающая методы совместного вычисления функции несколькими сторонами над их конфиденциальными входными данными без раскрытия этих данных друг другу. Широко применяется в Web3-кошельках и пороговом управлении ключами.
*   **Дата создания**: Первые теоретические основы (проблема миллионеров Яо) заложены Эндрю Яо (Andrew Yao) в 1982 году, широкое коммерческое внедрение в блокчейн началось с 2018 года.
*   **Источники**: [Yao's Protocols for Secure Computations (1982)](https://ieeexplore.ieee.org/document/4568388)

<a name="post"></a>

### PoSt (Proof of Spacetime)
*   **Описание**: Алгоритм доказательства хранения в Filecoin. Позволяет Storage Provider доказать сети, что он непрерывно хранил уникальную копию данных пользователя в течение всего срока действия контракта. Проверка осуществляется генерацией случайных ончейн-челленджей.
*   **Дата запуска**: Октябрь 2020 г.
*   **Источники**: [Filecoin Proof of Spacetime Specifications](https://spec.filecoin.io/#section-algorithms.crypto.proofs.proof-of-spacetime)

<a name="porep"></a>

### PoRep (Proof of Replication)
*   **Описание**: Алгоритм доказательства репликации в Filecoin. Доказывает сети, что Storage Provider физически запечатал (sealed) и сохранил абсолютно уникальную физическую копию данных на своем физическом накопителе, исключая атаки Sybil.
*   **Дата запуска**: Октябрь 2020 г.
*   **Источники**: [Filecoin Proof of Replication Specifications](https://spec.filecoin.io/#section-algorithms.crypto.proofs.proof-of-replication)

<a name="pre"></a>

### PRE (Proxy Re-Encryption)
*   **Описание**: Схема прокси-решифрования. Криптографический примитив, позволяющий полудоверенному посреднику (прокси-узлу) трансформировать шифртекст, зашифрованный под публичным ключом стороны А, в шифртекст для стороны Б, без раскрытия plaintext и закрытых ключей обеих сторон.
*   **Дата создания**: Впервые представлена Блейзом, Блеймером и Штраусом (Blaze, Bleumer, Strauss) в 1998 году. Web3-реализация осуществлена в NuCypher в 2017–2018 гг.
*   **Источники**: [Divertible Protocols and Proxy Cryptography (1998)](https://link.springer.com/chapter/10.1007/BFb0054017)

<a name="sbt"></a>

### SBT (Soulbound Token)
*   **Описание**: Непередаваемый, уникальный токен идентификации личности (пропуск), привязанный к конкретному адресу кошелька без возможности передачи, продажи или дарения. В Daskibo DRM выступает в роли непередаваемого временного билета доступа покупателя (`ClientNft`).
*   **Дата анонса**: Май 2022 года (публикация концепта Виталиком Бутериным, Гленом Вейлом и Пуджей Олхейвер).
*   **Источники**: [Decentralized Society: Finding Soul's Paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4106660)

<a name="spora"></a>

### SPoRA (Succinct Proof of Random Access)
*   **Описание**: Алгоритм консенсуса Arweave, стимулирующий постоянное хранение и быстрое извлечение данных. Требует от майнеров доказать, что они имеют мгновенный случайный доступ к случайной исторической транзакции ("recall block") для получения права майнить новый блок.
*   **Дата запуска**: Февраль 2021 г. (Arweave Hard Fork v2.4).
*   **Источники**: [SPoRA - Arweave Wiki](https://arwiki.wiki/#/en/spora)

<a name="taco"></a>

### TACo (Threshold Access/Action Control)
*   **Описание**: Децентрализованная пороговая криптографическая инфраструктура контроля доступа и действий в Threshold Network. Построена на схеме Proxy Re-Encryption и библиотеке Umbral, выступая чистым математическим гейтом доступа.
*   **Дата запуска**: Январь 2022 г. (запуск после слияния NuCypher и Keep).
*   **Источники**: [Threshold TACo Developer Docs](https://taco.build/)

<a name="tee"></a>

### TEE (Trusted Execution Environment)
*   **Описание**: Доверенная среда исполнения. Изолированная аппаратная область центрального процессора (например, Intel SGX, AMD SEV), гарантирующая абсолютную конфиденциальность и неизменяемость выполняемого внутри нее программного кода и данных от операционной системы хоста или гипервизора.
*   **Дата создания**: Первые спецификации TEE появились в начале 2000-х годов, спецификация GlobalPlatform TEE опубликована в 2010 году.
*   **Источники**: [GlobalPlatform TEE Specifications](https://globalplatform.org/specs-library/)

<a name="tss"></a>

### TSS (Threshold Secret Sharing)
*   **Описание**: Пороговое разделение секрета. Метод криптографии, разделяющий секретный ключ на $N$ долей таким образом, что для восстановления секрета требуется участие любого подмножества из $t$ (порогового числа) долей, основанный на схеме разделения секрета Шамира.
*   **Дата создания**: Разделение секрета Шамира предложено Ади Шамиром (Adi Shamir) в 1979 году.
*   **Источники**: [How to Share a Secret by Adi Shamir (1979)](https://dl.acm.org/doi/10.1145/359168.359176)

<a name="umbral"></a>

### Umbral Protocol
*   **Описание**: Пороговая криптографическая схема прокси-решифрования (PRE), разработанная NuCypher. Использует эллиптическую кривую `secp256k1` и позволяет распределять фрагменты ключа ре-шифрования (*kfrags*) по узлам сети, гарантируя защиту данных от сговора прокси-нод.
*   **Дата релиза**: 2018 год (NuCypher).
*   **Источники**: [Umbral Cryptography Reference Specification (GitHub)](https://github.com/nucypher/pyUmbral)
