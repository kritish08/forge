FROM alpine:3.18

# Install AWS CLI and MongoDB Tools
RUN apk add --no-cache \
    aws-cli \
    mongodb-tools \
    bash \
    tar \
    gzip

# Setup working directory
WORKDIR /backup

# Copy script
COPY backup.sh .
RUN chmod +x backup.sh

# Setup crontab to run at 2 AM everyday
RUN echo "0 2 * * * /backup/backup.sh > /proc/1/fd/1 2>/proc/1/fd/2" > /etc/crontabs/root

CMD ["crond", "-f", "-d", "8"]
