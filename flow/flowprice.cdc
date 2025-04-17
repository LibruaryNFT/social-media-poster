import PublicPriceOracle from 0xec67451f8a58216a

// 0xe385412159992e11

access(all) fun main(oracle: Address): [UFix64] {
    let lastResult = PublicPriceOracle.getLatestPrice(oracleAddr: oracle)
    let lastBlockNum = PublicPriceOracle.getLatestBlockHeight(oracleAddr: oracle)
    // Get block timestamp does not always work: the # of recent blocks cached and servicable are depending on execution nodes. 
    let lastTimestamp = getBlock(at: lastBlockNum)?.timestamp
    return [
        lastResult,
        UFix64(lastBlockNum),
        lastTimestamp ?? 0.0
    ]
}